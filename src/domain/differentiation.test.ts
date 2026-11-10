// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { afterDateAdvice, defaultKind, effectiveKind, pastBestBefore } from './date-kind';
import { plausiblePrice, toDraft } from './drafts';
import { canFreeze, canThaw, freezeItem } from './freeze';
import { canOffer, offerText } from './offer';
import { openItem } from './shelf-life';
import { atHome, wasteHabits } from './shopping';
import { wasteStats } from './stats';
import type { Item } from './types';

function item(overrides: Partial<Item>): Item {
  return {
    id: crypto.randomUUID(),
    household_id: 'local',
    created_by: null,
    name: 'Peito de frango',
    category: 'carne_fresca',
    location: 'frigorifico',
    ean: null,
    quantity: null,
    unit: null,
    purchased_at: null,
    opened_at: null,
    expires_at: '2026-11-11',
    expiry_source: 'impressa',
    status: 'ativo',
    resolved_at: null,
    created_at: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('kind of date', () => {
  it('knows the usual kind of each category, and the package wins', () => {
    expect(defaultKind('carne_fresca')).toBe('consumir_ate');
    expect(defaultKind('iogurtes')).toBe('consumir_de_preferencia');
    expect(defaultKind('fruta')).toBeNull();
    expect(effectiveKind(item({ category: 'iogurtes', expiry_kind: 'consumir_ate' }))).toBe(
      'consumir_ate',
    );
  });

  it('treats an opened item as "consumir até", whatever the label', () => {
    const opened = item({ category: 'leite_uht', opened_at: '2026-11-08T10:00:00Z' });
    expect(effectiveKind(opened)).toBe('consumir_ate');
  });

  it('says look, smell, taste past a best-before date, and not to risk a use-by one', () => {
    const yoghurt = item({ name: 'Iogurtes', category: 'iogurtes' });
    expect(pastBestBefore(yoghurt, -2)).toBe(true);
    expect(pastBestBefore(yoghurt, 0)).toBe(false);
    expect(afterDateAdvice(yoghurt, -2)).toMatch(/^Era data de preferência: olha, cheira, prova\./);
    expect(afterDateAdvice(item({}), -1)).toMatch(/não arrisques/);
    expect(afterDateAdvice(item({}), 1)).toBeNull();
    expect(afterDateAdvice(item({ category: 'fruta' }), -1)).toBeNull();
  });
});

describe('"Congelei"', () => {
  it('is offered in the last week, while still good', () => {
    expect(canFreeze(item({}), 1)).toBe(true);
    expect(canFreeze(item({}), 10)).toBe(false);
    // Past a use-by date it is too late; past a best-before one (bread) it is not.
    expect(canFreeze(item({}), -1)).toBe(false);
    expect(canFreeze(item({ category: 'pao_fresco', location: 'despensa' }), -1)).toBe(true);
    expect(canFreeze(item({ location: 'congelador' }), 1)).toBe(false);
    expect(canFreeze(item({ category: 'iogurtes' }), 1)).toBe(false);
  });

  it('moves it to the freezer for three months, and back to the fridge when taken out', () => {
    const frozen = {
      ...item({ opened_at: '2026-11-08T10:00:00Z' }),
      ...freezeItem('2026-11-10'),
    };
    expect(frozen).toMatchObject({
      location: 'congelador',
      expires_at: '2027-02-08',
      expiry_source: 'estimada',
      opened_at: null,
    });
    expect(canThaw(frozen)).toBe(true);
    const out = openItem(frozen, '2026-12-01', new Date('2026-12-01T10:00:00Z'));
    expect(out).toMatchObject({ location: 'frigorifico', expires_at: '2026-12-03' });
  });
});

describe('"Oferecer"', () => {
  it('is offered in the last week, never past a use-by date', () => {
    expect(canOffer(item({}), 0)).toBe(true);
    expect(canOffer(item({}), -1)).toBe(false);
    expect(canOffer(item({ category: 'iogurtes' }), -1)).toBe(true);
    expect(canOffer(item({}), 12)).toBe(false);
  });

  it('writes a message ready to send', () => {
    expect(offerText(item({ name: 'Iogurtes naturais' }), 1)).toBe(
      'Tenho Iogurtes naturais: a validade acaba amanhã e não vou conseguir usar a tempo. Queres? É só passares por cá.',
    );
  });
});

describe('prices', () => {
  it('keeps a plausible line price, rounded to the cent', () => {
    expect(plausiblePrice(2.584)).toBe(2.58);
    expect(plausiblePrice(0)).toBeNull();
    expect(plausiblePrice(1234)).toBeNull();
    expect(plausiblePrice(Number.NaN)).toBeNull();
  });

  it('carries the receipt price into the draft', () => {
    const draft = toDraft(
      {
        raw: 'IOG NAT 4X125',
        name: 'Iogurte natural',
        category: 'iogurtes',
        quantity: 4,
        unit: 'un',
        perishable: true,
        price: 1.29,
      },
      undefined,
      '2026-11-10',
    );
    expect(draft.price).toBe(1.29);
  });

  it('counts the waste in euros, only for items with a price', () => {
    const at = '2026-11-05T10:00:00.000Z';
    const stats = wasteStats(
      [
        item({ status: 'deitado_fora', resolved_at: at, price: 2.1 }),
        item({ status: 'deitado_fora', resolved_at: at, price: 0.2 }),
        item({ status: 'deitado_fora', resolved_at: at }),
        item({ status: 'consumido', resolved_at: at, price: 5 }),
      ],
      '2026-11-10',
    );
    expect(stats).toMatchObject({ wastedEuros: 2.3, eatenEuros: 5, priced: 3, wasted: 3 });
    expect(stats.months.at(-1)?.wastedEuros).toBe(2.3);
  });
});

describe('shopping that saves', () => {
  it('finds what is still at home, the one that ends first', () => {
    const active = [
      item({ name: 'Leite meio-gordo', expires_at: '2026-11-20' }),
      item({ name: 'Leite magro', expires_at: '2026-11-14' }),
      item({ name: 'Leiteira' }),
    ];
    expect(atHome('leite', active)?.name).toBe('Leite magro');
    expect(atHome('Natas', active)).toBeUndefined();
  });

  it('notices what tends to end in the bin', () => {
    const at = '2026-11-01T10:00:00.000Z';
    const habits = wasteHabits(
      [
        item({ name: 'Natas', status: 'deitado_fora', resolved_at: at }),
        item({ name: 'natas ', status: 'deitado_fora', resolved_at: at }),
        item({ name: 'Natas', status: 'consumido', resolved_at: at }),
        item({ name: 'Alface', status: 'deitado_fora', resolved_at: at }),
        item({ name: 'Alface', status: 'consumido', resolved_at: at }),
        item({ name: 'Alface', status: 'consumido', resolved_at: at }),
        item({ name: 'Old', status: 'deitado_fora', resolved_at: '2026-01-01T10:00:00Z' }),
        item({ name: 'Old', status: 'deitado_fora', resolved_at: '2026-01-02T10:00:00Z' }),
      ],
      '2026-11-10',
    );
    expect([...habits]).toEqual([['natas', { wasted: 2, ended: 3 }]]);
  });
});
