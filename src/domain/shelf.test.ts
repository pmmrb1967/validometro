// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { DraftItem } from './drafts';
import { placeDraft } from './shelf';

function draft(overrides: Partial<DraftItem>): DraftItem {
  return {
    key: 'k',
    raw: null,
    name: 'Iogurte natural',
    category: 'iogurtes',
    location: 'frigorifico',
    quantity: null,
    unit: null,
    perishable: true,
    expires_at: null,
    expiry_source: null,
    known: false,
    price: null,
    ...overrides,
  };
}

describe('first inventory from a photo', () => {
  it('puts everything where the photo was taken, with a date from today', () => {
    const placed = placeDraft(draft({ category: 'carne' }), 'congelador', '2026-11-10', null);
    expect(placed.location).toBe('congelador');
    expect(placed.expiry_source).toBe('estimada');
    expect(placed.expires_at! > '2027-01-01').toBe(true);
  });

  it('keeps a date legible in the photo as printed', () => {
    const placed = placeDraft(draft({}), 'frigorifico', '2026-11-10', '2026-11-18');
    expect(placed).toMatchObject({ expires_at: '2026-11-18', expiry_source: 'impressa' });
  });

  it('gives long-life things no date', () => {
    const placed = placeDraft(
      draft({ name: 'Arroz', category: 'longa_duracao', perishable: false }),
      'despensa',
      '2026-11-10',
      null,
    );
    expect(placed).toMatchObject({ location: 'despensa', expires_at: null, expiry_source: null });
  });
});
