// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Notes of the receipts this household saved (domain/receipts.ts), on this phone and, with an
 * account, shared at home (sync.ts): the same receipt read twice is told apart.
 */
import { receiptLines, type SeenReceipt } from '../../domain/receipts';
import { db, LOCAL_HOUSEHOLD, writeReceipt } from './items';

export function seenReceipts(store = db): Promise<SeenReceipt[]> {
  return store.receipts.toArray();
}

/** The receipt with this QR code, already saved here (the first time it was). */
export async function receiptWithQr(hash: string, store = db): Promise<SeenReceipt | undefined> {
  const found = await store.receipts.where('qr_hash').equals(hash).toArray();
  return found.sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
}

/** After "Guardar" on a receipt's review: what is kept to know it again. */
export async function rememberReceipt(
  reading: {
    qrHash: string | null;
    store: string | null;
    date: string | null;
    raws: readonly (string | null)[];
    items: number;
  },
  now = new Date(),
  store = db,
): Promise<void> {
  const at = now.toISOString();
  const household = (await store.meta.get('household'))?.value;
  await writeReceipt(store, {
    id: crypto.randomUUID(),
    household_id: typeof household === 'string' ? household : LOCAL_HOUSEHOLD,
    qr_hash: reading.qrHash,
    store: reading.store?.trim().slice(0, 120) || null,
    date: reading.date,
    lines: receiptLines(reading.raws).slice(0, 300),
    items: Math.min(reading.items, 1000),
    created_at: at,
    updated_at: at,
  });
}
