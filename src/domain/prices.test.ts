// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { listEstimate, priceBook, priceFor, pricedLines, pricePoints } from './prices';
import type { SeenReceipt } from './receipts';
import type { Item } from './types';

function receipt(store: string, date: string, prices: SeenReceipt['prices']): SeenReceipt {
  return {
    id: crypto.randomUUID(),
    household_id: 'local',
    qr_hash: null,
    store,
    date,
    lines: [],
    items: 1,
    total: null,
    prices,
    created_at: `${date}T17:00:00.000Z`,
    updated_at: `${date}T17:00:00.000Z`,
  };
}

const tomatoes: Item = {
  id: 't',
  household_id: 'local',
  created_by: null,
  name: 'Tomate',
  category: 'legumes',
  location: 'frigorifico',
  ean: null,
  quantity: null,
  unit: null,
  purchased_at: '2026-11-14T10:00:00.000Z',
  opened_at: null,
  expires_at: '2026-11-15',
  expiry_source: 'estimada',
  price: 2.5,
  receipt_id: null,
  status: 'ativo',
  resolved_at: null,
  created_at: '2026-11-14T10:00:00.000Z',
  updated_at: '2026-11-14T10:00:00.000Z',
};

describe('what things cost the last time', () => {
  const receipts = [
    receipt('Pingo Doce', '2026-11-01', [{ name: 'Leite pasteurizado', price: 0.99 }]),
    receipt('Auchan', '2026-11-11', [
      { name: 'Leite pasteurizado', price: 1.08 },
      // Not chosen for the inventory (long-life), still priced.
      { name: 'Maizena', price: 2.6 },
    ]),
  ];
  const book = priceBook(pricePoints(receipts, [tomatoes]), '2026-11-20');

  it('keeps the last price, and says where it was cheaper lately', () => {
    expect(priceFor('leite pasteurizado', book)).toMatchObject({
      price: 1.08,
      store: 'Auchan',
      cheaper: { price: 0.99, store: 'Pingo Doce' },
    });
    // Without a receipt (the farmer): its typed price.
    expect(priceFor('Tomate', book)).toMatchObject({ price: 2.5, store: null, loose: true });
    // A shorter name on the list finds the longer one.
    expect(priceFor('Leite', book)?.price).toBe(1.08);
    expect(priceFor('Ovos', book)).toBeUndefined();
  });

  it('estimates the list with what is known', () => {
    expect(listEstimate(['Leite', 'Maizena', 'Tomate', 'Ovos'], book)).toEqual({
      euros: 6.18,
      known: 3,
      of: 4,
    });
  });

  it('keeps each line once, named and with a price', () => {
    expect(
      pricedLines([
        { name: ' Iogurte ', price: 1.2 },
        { name: 'iogurte', price: 1.3 },
        { name: '', price: 2 },
        { name: 'Sal', price: null },
      ]),
    ).toEqual([{ name: 'Iogurte', price: 1.2 }]);
  });
});
