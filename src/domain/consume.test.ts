// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  canEatPart,
  canTakeOne,
  eatPartLabel,
  isDrink,
  leftAfterEating,
  leftAfterShare,
  takeOneLabel,
  trackedStaples,
  usedWord,
} from './consume';
import type { Item } from './types';

function item(overrides: Partial<Item>): Item {
  return {
    id: crypto.randomUUID(),
    household_id: 'local',
    created_by: null,
    name: 'Iogurtes',
    category: 'iogurtes',
    location: 'frigorifico',
    ean: null,
    quantity: null,
    unit: null,
    purchased_at: null,
    opened_at: null,
    expires_at: null,
    expiry_source: null,
    status: 'ativo',
    resolved_at: null,
    created_at: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('eaten or drunk', () => {
  it('drinks milk, water and beer, and eats the rest', () => {
    expect(usedWord(item({ name: 'Leite meio-gordo', category: 'leite_uht' }))).toBe('Bebido');
    expect(usedWord(item({ name: 'Água Monchique 5L', category: null }))).toBe('Bebido');
    expect(isDrink(item({ name: 'Super Bock lata', category: 'bebidas' }))).toBe(true);
    expect(usedWord(item({}))).toBe('Comido');
    expect(takeOneLabel(item({ name: 'Sumo de laranja', category: null }))).toBe('Bebi 1');
    expect(takeOneLabel(item({}))).toBe('Comi 1');
  });

  it('takes one off only what is counted, and more than one', () => {
    expect(canTakeOne(item({ quantity: 4, unit: 'un' }))).toBe(true);
    expect(canTakeOne(item({ quantity: 6, unit: null }))).toBe(true);
    expect(canTakeOne(item({ quantity: 6, unit: 'latas' }))).toBe(true);
    expect(canTakeOne(item({ quantity: 1, unit: 'un' }))).toBe(false);
    expect(canTakeOne(item({ quantity: 1.632, unit: 'kg' }))).toBe(false);
    expect(canTakeOne(item({ quantity: 2, unit: 'kg' }))).toBe(false);
  });
});

describe('staples the household follows', () => {
  it('are the long-life things it saved in the last year', () => {
    const followed = trackedStaples(
      [
        item({ name: 'Azeite virgem extra', category: 'longa_duracao' }),
        item({ name: 'Café', category: 'longa_duracao', created_at: '2025-01-01T10:00:00Z' }),
        item({ name: 'Iogurtes' }),
      ],
      '2026-11-10',
    );
    expect([...followed]).toEqual(['azeite virgem extra']);
  });
});

describe('eating part of something sold by weight', () => {
  const chops = item({
    name: 'Costeletas de porco',
    category: 'carne',
    quantity: 1.178,
    unit: 'kg',
  });

  it('reads grams, kilos and a bare number', () => {
    expect(leftAfterEating(chops, '400 g')).toBe(0.778);
    expect(leftAfterEating(chops, '0,4 kg')).toBe(0.778);
    expect(leftAfterEating(chops, '400')).toBe(0.778);
    expect(leftAfterEating(chops, '0,5')).toBe(0.678);
    expect(leftAfterEating(chops, '2 kg')).toBe(0);
  });

  it('refuses what it cannot read or another kind of unit', () => {
    expect(leftAfterEating(chops, 'muito')).toBeNull();
    expect(leftAfterEating(chops, '1 L')).toBeNull();
    expect(leftAfterEating(item({ quantity: 4, unit: 'un' }), '1')).toBeNull();
  });

  it('offers it only for weights and volumes, in the right words', () => {
    expect(canEatPart(chops)).toBe(true);
    expect(canEatPart(item({ quantity: 4, unit: 'un' }))).toBe(false);
    expect(eatPartLabel(chops)).toBe('Comi uma parte');
    expect(eatPartLabel(item({ name: 'Sumo de laranja', category: null }))).toBe('Bebi uma parte');
    expect(leftAfterShare(chops, 'metade')).toBe(0.589);
  });
});
