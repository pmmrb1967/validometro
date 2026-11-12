// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * What things cost the last time, for the shopping list: the prices read on the receipts
 * (every line, chosen or not) and the ones typed for things bought without one. An estimate:
 * prices change, promotions end, packs differ.
 */
import { addDays, lisbonDate } from './dates';
import type { SeenReceipt } from './receipts';
import { sameName } from './shopping';
import type { Item } from './types';

/** One line of a receipt saved, with its price (the name as corrected on the review). */
export interface PricedLine {
  name: string;
  price: number;
}

export interface PricePoint {
  name: string;
  price: number;
  /** The shop; null when bought without a receipt (the farmer). */
  store: string | null;
  /** YYYY-MM-DD. */
  day: string;
}

export interface KnownPrice extends PricePoint {
  /** Lower the last time somewhere else (in the last CHEAPER_DAYS days). */
  cheaper?: PricePoint;
}

/** A price elsewhere older than this says little about today's. */
export const CHEAPER_DAYS = 90;

export function pricePoints(
  receipts: readonly SeenReceipt[],
  items: readonly Item[],
): PricePoint[] {
  const points: PricePoint[] = [];
  for (const receipt of receipts) {
    const day = receipt.date ?? lisbonDate(new Date(receipt.created_at));
    for (const line of receipt.prices ?? []) {
      if (line.price > 0) points.push({ ...line, store: receipt.store, day });
    }
  }
  for (const item of items) {
    // From a receipt: in its lines already. Deleted: never bought.
    if (item.receipt_id || item.status === 'apagado' || !item.price || item.price <= 0) continue;
    points.push({
      name: item.name,
      price: item.price,
      store: null,
      day: lisbonDate(new Date(item.purchased_at ?? item.created_at)),
    });
  }
  return points;
}

const shopKey = (store: string | null) => (store ? sameName(store) : '');

/** The last price of each thing (by sameName), and a lower one in another shop lately. */
export function priceBook(points: readonly PricePoint[], today: string): Map<string, KnownPrice> {
  const byName = new Map<string, PricePoint[]>();
  for (const point of points) {
    const key = sameName(point.name);
    byName.set(key, [...(byName.get(key) ?? []), point]);
  }
  const since = addDays(today, -CHEAPER_DAYS);
  const book = new Map<string, KnownPrice>();
  for (const [key, list] of byName) {
    const sorted = [...list].sort((a, b) => b.day.localeCompare(a.day));
    const last = sorted[0]!;
    // The latest price in each other shop, lately.
    const elsewhere = new Map<string, PricePoint>();
    for (const point of sorted) {
      if (point.day < since || shopKey(point.store) === shopKey(last.store)) continue;
      if (!elsewhere.has(shopKey(point.store))) elsewhere.set(shopKey(point.store), point);
    }
    const cheaper = [...elsewhere.values()]
      .filter((point) => point.price < last.price - 0.005)
      .sort((a, b) => a.price - b.price)[0];
    book.set(key, cheaper ? { ...last, cheaper } : last);
  }
  return book;
}

/**
 * The price of something on the list: its own name, else something whose name starts with
 * it ("leite" → "Leite pasteurizado"), the most recent.
 */
export function priceFor(
  name: string,
  book: ReadonlyMap<string, KnownPrice>,
): KnownPrice | undefined {
  const key = sameName(name);
  if (!key) return undefined;
  const exact = book.get(key);
  if (exact) return exact;
  let best: KnownPrice | undefined;
  for (const [other, known] of book) {
    if (!other.startsWith(`${key} `)) continue;
    if (!best || known.day > best.day) best = known;
  }
  return best;
}

export interface ListEstimate {
  euros: number;
  /** Entries with a known price, of how many. */
  known: number;
  of: number;
}

export function listEstimate(
  names: readonly string[],
  book: ReadonlyMap<string, KnownPrice>,
): ListEstimate {
  let euros = 0;
  let known = 0;
  for (const name of names) {
    const price = priceFor(name, book);
    if (!price) continue;
    euros += price.price;
    known++;
  }
  return { euros: Math.round(euros * 100) / 100, known, of: names.length };
}

/** The lines of a receipt worth keeping a price of: named, with a plausible price. */
export function pricedLines(rows: readonly { name: string; price: number | null }[]): PricedLine[] {
  const seen = new Set<string>();
  const lines: PricedLine[] = [];
  for (const row of rows) {
    const name = row.name.trim().slice(0, 120);
    if (!name || row.price === null || row.price <= 0 || seen.has(sameName(name))) continue;
    seen.add(sameName(name));
    lines.push({ name, price: row.price });
  }
  return lines.slice(0, 300);
}
