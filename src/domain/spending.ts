// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * What was spent each month, from what the app knows: the receipts read (their total, all
 * lines, food or not) and the prices typed for things bought without one (the farmer's
 * tomatoes). Not a budget: purchases never read here are not in it.
 */
import { lisbonDate } from './dates';
import type { SeenReceipt } from './receipts';
import { lastMonths } from './stats';
import type { Item } from './types';

export interface MonthSpending {
  /** YYYY-MM. */
  month: string;
  euros: number;
  /** Receipts with a total, that month. */
  receipts: number;
  /** Items with a price and no receipt. */
  loose: number;
}

export interface Spending {
  months: MonthSpending[];
  euros: number;
  receipts: number;
  loose: number;
}

const cents = (value: number) => Math.round(value * 100) / 100;

/**
 * Since 0.18.0, an item from a receipt points to it (receipt_id). Before, nothing said where
 * a price came from: those items are not counted as bought without a receipt (most came from
 * one, whose total was not kept either).
 */
export const RECEIPT_LINK_SINCE = '2026-11-12T15:50:00.000Z';

/** Bought without a receipt, with a price typed: counted on its own. */
export function boughtLoose(item: Item): boolean {
  return (
    !item.receipt_id &&
    item.created_at >= RECEIPT_LINK_SINCE &&
    item.status !== 'apagado' &&
    item.price != null &&
    item.price > 0
  );
}

export function monthlySpending(
  receipts: readonly SeenReceipt[],
  items: readonly Item[],
  today: string,
  monthCount = 6,
): Spending {
  const months = new Map(
    lastMonths(today, monthCount).map((month) => [
      month,
      { month, euros: 0, receipts: 0, loose: 0 },
    ]),
  );
  for (const receipt of receipts) {
    if (!receipt.total || receipt.total <= 0) continue;
    const day = receipt.date ?? lisbonDate(new Date(receipt.created_at));
    const entry = months.get(day.slice(0, 7));
    if (!entry) continue;
    entry.euros += receipt.total;
    entry.receipts++;
  }
  for (const item of items) {
    // From a receipt: already in its total. Deleted (saved by mistake): never bought.
    if (!boughtLoose(item)) continue;
    const entry = months.get(
      lisbonDate(new Date(item.purchased_at ?? item.created_at)).slice(0, 7),
    );
    if (!entry) continue;
    entry.euros += item.price ?? 0;
    entry.loose++;
  }
  const list = [...months.values()].map((month) => ({ ...month, euros: cents(month.euros) }));
  return {
    months: list,
    euros: cents(list.reduce((sum, month) => sum + month.euros, 0)),
    receipts: list.reduce((sum, month) => sum + month.receipts, 0),
    loose: list.reduce((sum, month) => sum + month.loose, 0),
  };
}

/**
 * The receipt's total: the QR code's when it has one (exact), else the sum of the prices read
 * on all its lines, chosen or not (null when none was read).
 */
export function receiptTotal(
  qrTotal: number | null | undefined,
  prices: readonly (number | null)[],
): number | null {
  if (qrTotal != null && qrTotal > 0) return cents(qrTotal);
  const sum = prices.reduce<number>((total, price) => total + (price ?? 0), 0);
  return sum > 0 ? cents(sum) : null;
}
