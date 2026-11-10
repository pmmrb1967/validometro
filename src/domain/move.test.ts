// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { freezesBadly, moveItem } from './move';
import type { Item } from './types';

function item(overrides: Partial<Item>): Item {
  return {
    id: 'i',
    household_id: 'local',
    created_by: null,
    name: 'Coisa',
    category: null,
    location: 'despensa',
    ean: null,
    quantity: null,
    unit: null,
    purchased_at: '2026-11-08T10:00:00.000Z',
    opened_at: null,
    expires_at: null,
    expiry_source: null,
    status: 'ativo',
    resolved_at: null,
    created_at: '2026-11-08T10:00:00.000Z',
    ...overrides,
  };
}

const TODAY = '2026-11-10';

describe('moving an item', () => {
  it('keeps a printed date wherever it goes (the beer into the fridge)', () => {
    const beer = item({
      name: 'Cerveja',
      category: 'bebidas',
      expires_at: '2027-06-30',
      expiry_source: 'impressa',
    });
    expect(moveItem(beer, 'frigorifico', TODAY)).toMatchObject({
      location: 'frigorifico',
      expires_at: '2027-06-30',
      expiry_source: 'impressa',
    });
  });

  it('redoes an estimate with the new place, from the day it was bought', () => {
    const veg = item({ category: 'legumes', expires_at: '2026-11-09', expiry_source: 'estimada' });
    expect(moveItem(veg, 'frigorifico', TODAY)).toMatchObject({
      location: 'frigorifico',
      expires_at: '2026-11-12',
      expiry_source: 'estimada',
    });
  });

  it('into the freezer is "Congelei"; out of it, a short date from today', () => {
    const meat = item({
      category: 'carne_fresca',
      location: 'frigorifico',
      expires_at: '2026-11-11',
      expiry_source: 'estimada',
    });
    const frozen = moveItem(meat, 'congelador', TODAY);
    expect(frozen).toMatchObject({ location: 'congelador', expiry_source: 'estimada' });
    expect(frozen.expires_at! > '2027-01-01').toBe(true);
    const thawed = moveItem({ ...meat, ...frozen }, 'frigorifico', TODAY);
    expect(thawed).toMatchObject({ location: 'frigorifico', expires_at: '2026-11-12' });
    expect(thawed.opened_at).not.toBeNull();
  });

  it('keeps the date of something bought frozen, and warns only for what freezes badly', () => {
    const peas = item({
      category: 'congelados',
      location: 'frigorifico',
      expires_at: '2027-03-01',
      expiry_source: 'impressa',
    });
    expect(moveItem(peas, 'congelador', TODAY).expires_at).toBe('2027-03-01');
    expect(freezesBadly(peas)).toBe(false);
    expect(freezesBadly(item({ category: 'iogurtes' }))).toBe(true);
    expect(freezesBadly(item({ category: 'carne_fresca' }))).toBe(false);
  });
});
