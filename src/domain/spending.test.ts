// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { SeenReceipt } from './receipts';
import { monthlySpending, receiptTotal } from './spending';
import type { Item } from './types';

function receipt(overrides: Partial<SeenReceipt>): SeenReceipt {
  return {
    id: crypto.randomUUID(),
    household_id: 'local',
    qr_hash: null,
    store: 'Auchan',
    date: '2026-11-11',
    lines: [],
    items: 1,
    total: 4.93,
    created_at: '2026-11-11T17:00:00.000Z',
    updated_at: '2026-11-11T17:00:00.000Z',
    ...overrides,
  };
}

function item(overrides: Partial<Item>): Item {
  return {
    id: crypto.randomUUID(),
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
    ...overrides,
  };
}

describe('what was spent each month', () => {
  it('adds the receipts read and the prices typed without one, never a receipt twice', () => {
    const auchan = receipt({});
    const spending = monthlySpending(
      [auchan, receipt({ date: '2026-10-30', total: 30 }), receipt({ total: null })],
      [
        // The farmer's tomatoes: no receipt, a price typed.
        item({}),
        // The milk from the Auchan receipt: already in its total.
        item({ name: 'Leite', price: 1.08, receipt_id: auchan.id }),
        // Saved by mistake, or without a price: nothing.
        item({ price: 3, status: 'apagado' }),
        item({ price: null }),
      ],
      '2026-11-20',
    );
    expect(spending.months.at(-1)).toEqual({
      month: '2026-11',
      euros: 7.43,
      receipts: 1,
      loose: 1,
    });
    expect(spending.months.at(-2)).toMatchObject({ month: '2026-10', euros: 30, receipts: 1 });
    expect(spending.euros).toBe(37.43);
  });

  it('does not count as bought without a receipt what was saved before 0.18 (source unknown)', () => {
    const older = item({
      created_at: '2026-11-11T17:34:43.227Z',
      purchased_at: '2026-11-11T17:34:43.227Z',
    });
    expect(monthlySpending([], [older], '2026-11-20').euros).toBe(0);
  });

  it("takes the QR code's total, else the sum of every line read", () => {
    expect(receiptTotal(4.93, [1.08, null])).toBe(4.93);
    expect(receiptTotal(null, [2.6, 1.25, 1.08, null])).toBe(4.93);
    expect(receiptTotal(undefined, [null])).toBeNull();
  });
});
