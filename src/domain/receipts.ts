// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The same receipt, read twice (two people at home, or a photo and then the PDF): the
 * household keeps a note of each receipt it saved, never the receipt itself.
 *
 * - With its QR code (every Portuguese invoice from certified software, Portaria 195/2020):
 *   the shop's tax number (field A) and the document's own number (field G) say which
 *   purchase it is, for certain, before the AI is asked. Only a hash of the two is kept;
 *   the buyer's tax number (field B) is never read into anything.
 * - Without it: a fingerprint of the lines read (short hashes), the shop and the date. Two
 *   receipts that share most of their lines on the same day are probably one: said as a
 *   doubt, after the reading.
 */
import type { PricedLine } from './prices';
import { aliasKey, storeKey } from './drafts';
import { isIsoDate } from './dates';

export interface ReceiptQr {
  /** Field A: the shop's NIF. */
  issuer: string;
  /** Field G: the document's own number ("FS 0123/45678"). */
  document: string;
  /** Field F, as YYYY-MM-DD. */
  date: string | null;
  /** Field O: the total with tax, in euros. */
  total: number | null;
}

/** "A:500123456*B:999999990*...": the AT's QR code on a Portuguese invoice, or null. */
export function parseReceiptQr(text: string): ReceiptQr | null {
  if (!text.includes('*') || !/^A:/.test(text.trim())) return null;
  const fields = new Map<string, string>();
  for (const part of text.trim().split('*')) {
    const at = part.indexOf(':');
    if (at > 0) fields.set(part.slice(0, at), part.slice(at + 1).trim());
  }
  const issuer = fields.get('A') ?? '';
  const document = (fields.get('G') ?? '').replace(/\s+/g, ' ').toUpperCase();
  if (!/^\d{9}$/.test(issuer) || !document) return null;
  const f = fields.get('F') ?? '';
  const date = /^\d{8}$/.test(f) ? `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}` : null;
  const total = Number(fields.get('O'));
  return {
    issuer,
    document,
    date: date && isIsoDate(date) ? date : null,
    total: Number.isFinite(total) && fields.has('O') ? total : null,
  };
}

/** What is kept of the QR code: a hash of the shop and the document number, nothing more. */
export async function receiptQrHash(qr: ReceiptQr): Promise<string> {
  const bytes = new TextEncoder().encode(`validometro-receipt|${qr.issuer}|${qr.document}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A short hash of one line (FNV-1a): enough to compare receipts, not to read them back. */
function lineHash(raw: string): string {
  let hash = 0x811c9dc5;
  for (const char of aliasKey(raw)) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function receiptLines(raws: readonly (string | null)[]): string[] {
  return [...new Set(raws.flatMap((raw) => (raw && aliasKey(raw) ? [lineHash(raw)] : [])))].sort();
}

/** One receipt the household saved. Never deleted (like the recipes). */
export interface SeenReceipt {
  id: string;
  household_id: string;
  /** Hex SHA-256 of the QR code's shop and number; null when it had none (or unread). */
  qr_hash: string | null;
  store: string | null;
  /** The purchase's day (from the QR code or the reading). */
  date: string | null;
  /** Hashes of the lines read (receiptLines). */
  lines: string[];
  /** How many items were saved from it. */
  items: number;
  /** What was paid, in euros (the QR code's total, or the prices read); absent before 0.18. */
  total?: number | null;
  /** Each line's name (as corrected) and price, for the shopping list; absent before 0.19. */
  prices?: PricedLine[];
  created_at: string;
  updated_at: string;
}

/** Fewer lines than this and two receipts are too small to call the same. */
const MIN_LINES = 3;
const SAME_SHARE = 0.8;

export interface Resemblance {
  receipt: SeenReceipt;
  /** Lines of the new one found in the old one. */
  shared: number;
  of: number;
}

/**
 * A receipt already saved that this one (no QR code) resembles: the same day when both say
 * it, the same shop when both say it, and most of its lines.
 */
export function resembling(
  reading: { store: string | null; date: string | null; lines: readonly string[] },
  seen: readonly SeenReceipt[],
): Resemblance | undefined {
  if (reading.lines.length < MIN_LINES) return undefined;
  let best: Resemblance | undefined;
  for (const receipt of seen) {
    if (reading.date && receipt.date && reading.date !== receipt.date) continue;
    if (reading.store && receipt.store && storeKey(reading.store) !== storeKey(receipt.store))
      continue;
    const old = new Set(receipt.lines);
    const shared = reading.lines.filter((line) => old.has(line)).length;
    const of = reading.lines.length;
    if (shared / Math.min(of, Math.max(old.size, 1)) >= SAME_SHARE && shared >= MIN_LINES) {
      if (!best || shared > best.shared) best = { receipt, shared, of };
    }
  }
  return best;
}
