// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  recentlyWasted,
  restockSuggestion,
  sameName,
  shoppingOrder,
  type ShoppingEntry,
} from './shopping';
import { lastMonths, wasteStats } from './stats';
import type { Item } from './types';

const now = new Date('2026-11-09T12:00:00Z');

function item(overrides: Partial<Item>): Item {
  return {
    id: crypto.randomUUID(),
    household_id: 'local',
    created_by: null,
    name: 'Leite',
    category: 'leite_uht',
    location: 'despensa',
    ean: null,
    quantity: null,
    unit: null,
    purchased_at: null,
    opened_at: null,
    expires_at: '2026-11-12',
    expiry_source: 'estimada',
    status: 'ativo',
    resolved_at: null,
    created_at: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

function entry(overrides: Partial<ShoppingEntry>): ShoppingEntry {
  return {
    id: crypto.randomUUID(),
    household_id: 'local',
    name: 'Leite',
    category: null,
    source: 'manual',
    state: 'pendente',
    item_id: null,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('shopping list', () => {
  it('suggests what was eaten, once', () => {
    const milk = item({});
    const suggestion = restockSuggestion(milk, [], now);
    expect(suggestion).toMatchObject({
      name: 'Leite',
      source: 'auto',
      state: 'sugerido',
      item_id: milk.id,
    });
    expect(restockSuggestion(milk, [entry({ name: ' leite ' })], now)).toBeNull();
    // Bought or removed earlier: it can come back.
    expect(restockSuggestion(milk, [entry({ state: 'comprado' })], now)).not.toBeNull();
  });

  it('matches names without case or accents', () => {
    expect(sameName('  Pão  de Forma')).toBe(sameName('pao de forma'));
  });

  it('remembers what was thrown away lately', () => {
    const wasted = recentlyWasted(
      [
        item({ name: 'Alface', status: 'deitado_fora', resolved_at: '2026-11-01T10:00:00Z' }),
        item({ name: 'Natas', status: 'deitado_fora', resolved_at: '2026-07-01T10:00:00Z' }),
        item({ name: 'Iogurte', status: 'consumido', resolved_at: '2026-11-01T10:00:00Z' }),
      ],
      '2026-11-09',
    );
    expect([...wasted]).toEqual(['alface']);
  });

  it('puts suggestions first and what is in the cart last', () => {
    const list = [
      entry({ state: 'comprado' }),
      entry({ state: 'pendente' }),
      entry({ state: 'sugerido' }),
    ];
    expect(list.sort(shoppingOrder).map((e) => e.state)).toEqual([
      'sugerido',
      'pendente',
      'comprado',
    ]);
  });
});

describe('waste statistics', () => {
  it('lists the last months, across the year', () => {
    expect(lastMonths('2026-02-10', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('counts by Lisbon month and ranks the categories thrown away', () => {
    const stats = wasteStats(
      [
        item({ status: 'consumido', resolved_at: '2026-11-02T10:00:00Z' }),
        item({ status: 'deitado_fora', category: 'saladas', resolved_at: '2026-11-03T10:00:00Z' }),
        item({ status: 'deitado_fora', category: 'saladas', resolved_at: '2026-10-03T10:00:00Z' }),
        // 23:30 UTC on 31 October is already November in Lisbon? No: winter time, UTC+0.
        item({ status: 'deitado_fora', category: 'iogurtes', resolved_at: '2026-10-31T23:30:00Z' }),
        // Summer time: 23:30 UTC on 31 August is 1 September in Lisbon.
        item({ status: 'consumido', resolved_at: '2026-08-31T23:30:00Z' }),
        item({ status: 'ativo' }),
        item({ status: 'deitado_fora', resolved_at: '2025-01-01T10:00:00Z' }),
      ],
      '2026-11-09',
    );
    expect(stats.months.map((m) => m.month)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(stats.months.at(-1)).toEqual({ month: '2026-11', eaten: 1, wasted: 1, wastedEuros: 0 });
    expect(stats.months.at(-2)).toEqual({ month: '2026-10', eaten: 0, wasted: 2, wastedEuros: 0 });
    expect(stats.months.find((m) => m.month === '2026-09')?.eaten).toBe(1);
    expect(stats.categories[0]).toMatchObject({ category: 'saladas', wasted: 2 });
    expect(stats).toMatchObject({ eaten: 2, wasted: 3 });
  });
});
