// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Drafts: what the three ways in (receipt, voice, barcode) produce before anything is saved.
 * The user reviews them on one screen; the AI never writes to the inventory (CLAUDE.md).
 */
import { categoryById, normalize, suggestCategory } from './categories';
import { daysBetween, isIsoDate } from './dates';
import { isLongLife, suggestExpiry } from './shelf-life';
import type { ExpirySource, IsoDate, Location } from './types';

/** One line as the AI reads it (receipt or voice), already checked against its schema. */
export interface DraftLine {
  /** The receipt's own text ("IOG NAT 4X125"); null when spoken. */
  raw: string | null;
  name: string;
  category: string | null;
  quantity: number | null;
  unit: string | null;
  perishable: boolean;
  /** Only when the user said the date out loud. */
  expires_at?: string | null;
  /** The receipt line's price, in euros. */
  price?: number | null;
}

/** What the shared dictionary already knows about a receipt abbreviation. */
export interface KnownAlias {
  canonical_name: string;
  category: string | null;
  perishable: boolean;
}

export interface DraftItem {
  key: string;
  raw: string | null;
  name: string;
  category: string | null;
  location: Location;
  quantity: number | null;
  unit: string | null;
  perishable: boolean;
  expires_at: IsoDate | null;
  expiry_source: ExpirySource | null;
  /** The name came from the dictionary, not from the AI's guess. */
  known: boolean;
  /** In euros, from the receipt; null when not read. */
  price: number | null;
}

/**
 * Receipt text as a dictionary key: no accents, lower case, single spaces, and no price at
 * the end ("IOG. NAT 1,29" and "iog. nat" are the same line).
 */
export function aliasKey(raw: string): string {
  return normalize(raw)
    .replace(/\s+/g, ' ')
    .replace(/(\s+-?\d+[.,]\d{2}\s*(€|eur|[a-z])?)+$/, '')
    .trim()
    .slice(0, 120);
}

/** Stores are part of the key ("PAO" at a bakery chain is not "PAO" elsewhere); '' = any. */
export function storeKey(store: string | null | undefined): string {
  return store ? normalize(store).replace(/\s+/g, ' ').slice(0, 60) : '';
}

/**
 * The day expiry is counted from: the receipt's date when it is plausible (the last two
 * weeks), else today. A photo taken days after shopping still gives the right estimate.
 */
export function purchaseDay(receiptDate: string | null | undefined, today: IsoDate): IsoDate {
  if (!receiptDate || !isIsoDate(receiptDate)) return today;
  const ago = daysBetween(receiptDate, today);
  return ago >= 0 && ago <= 14 ? receiptDate : today;
}

/** A spoken date is kept only when it is a real day, not long past and not absurdly far. */
function spokenDate(value: string | null | undefined, today: IsoDate): IsoDate | null {
  if (!value || !isIsoDate(value)) return null;
  const ahead = daysBetween(today, value);
  return ahead >= -7 && ahead <= 3650 ? value : null;
}

export function toDraft(
  line: DraftLine,
  alias: KnownAlias | undefined,
  today: IsoDate,
  from: IsoDate = today,
): DraftItem {
  const name = (alias?.canonical_name ?? line.name).trim() || (line.raw ?? '').trim();
  const category =
    categoryById(alias?.category ?? null)?.id ??
    categoryById(line.category)?.id ??
    suggestCategory(name) ??
    null;
  // A type with a date rule is in the traffic light (UHT milk too, as when typed by hand);
  // the AI's own opinion only counts when there is no type.
  const perishable = alias?.perishable ?? (category ? !isLongLife(category) : line.perishable);
  const location: Location =
    categoryById(category)?.defaultLocation ?? (perishable ? 'frigorifico' : 'despensa');
  const said = spokenDate(line.expires_at, today);
  const estimated = perishable ? suggestExpiry(category, location, 'fechado', from) : null;
  // An estimate counted from an older receipt can already be behind us: keep it at today.
  const expires = said ?? (estimated && estimated < today ? today : estimated);
  return {
    key: crypto.randomUUID(),
    raw: line.raw,
    name,
    category,
    location,
    quantity: line.quantity != null && line.quantity > 0 ? line.quantity : null,
    unit: line.unit?.trim() || null,
    perishable,
    expires_at: expires,
    expiry_source: said ? 'manual' : expires ? 'estimada' : null,
    known: alias !== undefined,
    price: plausiblePrice(line.price),
  };
}

/** A line's price, kept when it looks like one (a misread total or code is not). */
export function plausiblePrice(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0 || value > 500) return null;
  return Math.round(value * 100) / 100;
}

/** A date the AI read on a package, kept only when it is plausible for food. */
export function plausiblePrintedDate(value: string | null, today: IsoDate): IsoDate | null {
  if (!value || !isIsoDate(value)) return null;
  const ahead = daysBetween(today, value);
  return ahead >= -365 && ahead <= 3650 ? value : null;
}
