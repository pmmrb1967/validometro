// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { categoryById, categoryFromOffTags, suggestCategory } from './categories';
import { addDays, daysBetween, formatShortDate, lisbonDate } from './dates';
import { findRule, isLongLife, openItem, suggestExpiry } from './shelf-life';
import { bySoonest, daysLabel, light, lightFor } from './traffic-light';
import type { Item } from './types';

function item(over: Partial<Item> = {}): Item {
  return {
    id: 'i1',
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
    expires_at: '2027-02-01',
    expiry_source: 'impressa',
    status: 'ativo',
    resolved_at: null,
    created_at: '2026-11-09T10:00:00.000Z',
    ...over,
  };
}

describe('dates', () => {
  it('uses the Lisbon calendar day, not UTC', () => {
    // 23:30 UTC on 30 June is already 1 July in Lisbon (summer time, UTC+1).
    expect(lisbonDate(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01');
    // In winter Lisbon is on UTC.
    expect(lisbonDate(new Date('2026-12-31T23:30:00Z'))).toBe('2026-12-31');
  });

  it('adds and counts days across months and DST changes', () => {
    expect(addDays('2026-10-24', 3)).toBe('2026-10-27');
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(daysBetween('2026-11-09', '2026-11-12')).toBe(3);
    expect(daysBetween('2026-11-09', '2026-11-07')).toBe(-2);
  });

  it('shows short dates with the month spelled out', () => {
    expect(formatShortDate('2026-11-10')).toBe('10 nov.');
    expect(formatShortDate('2027-02-07')).toBe('7 fev.');
  });
});

describe('shelf-life rules', () => {
  it('estimates from the closed rule for the place', () => {
    expect(suggestExpiry('carne_picada', 'frigorifico', 'fechado', '2026-11-09')).toBe(
      '2026-11-10',
    );
    expect(suggestExpiry('leite_fresco', 'frigorifico', 'fechado', '2026-11-09')).toBe(
      '2026-11-14',
    );
    expect(suggestExpiry('congelados', 'congelador', 'fechado', '2026-11-09')).toBe('2027-03-09');
  });

  it('opened is shorter than closed (UHT milk: 90 days closed, 4 opened)', () => {
    expect(findRule('leite_uht', 'despensa', 'fechado')?.days_default).toBe(90);
    expect(findRule('leite_uht', 'frigorifico', 'aberto')?.days_default).toBe(4);
  });

  it('falls back to the same category when the place has no rule', () => {
    // Opened UHT milk lives in the fridge; the item may still say pantry: the opened rule wins.
    expect(findRule('leite_uht', 'despensa', 'aberto')?.days_default).toBe(4);
    // Closed cured cheese: only an opened rule exists, in the same place.
    expect(findRule('queijo_curado', 'frigorifico', 'fechado')?.days_default).toBe(21);
    // Fruit in the freezer: no rule there, use the closed rule elsewhere.
    expect(findRule('fruta', 'congelador', 'fechado')?.days_default).toBe(5);
    expect(findRule(null, 'frigorifico', 'fechado')).toBeUndefined();
    expect(findRule('nao_existe', 'frigorifico', 'fechado')).toBeUndefined();
  });

  it('has no estimate for long-life staples', () => {
    expect(suggestExpiry('longa_duracao', 'despensa', 'fechado', '2026-11-09')).toBeNull();
    expect(isLongLife('longa_duracao')).toBe(true);
    expect(isLongLife('iogurtes')).toBe(false);
    expect(isLongLife(null)).toBe(false);
  });
});

describe('"Abri isto"', () => {
  const now = new Date('2026-11-09T12:00:00Z');

  it('brings the expiry forward to the opened rule', () => {
    const opened = openItem(item({ location: 'frigorifico' }), '2026-11-09', now);
    expect(opened).toEqual({
      opened_at: now.toISOString(),
      location: 'frigorifico',
      expires_at: '2026-11-13',
      expiry_source: 'estimada',
    });
  });

  it('moves UHT milk from the pantry to the fridge when opened (the bug seen in the app)', () => {
    expect(openItem(item(), '2026-11-09', now)).toMatchObject({
      location: 'frigorifico',
      expires_at: '2026-11-13',
      expiry_source: 'estimada',
    });
  });

  it('keeps the place when the opened rule is there, and ignores closed-only rules', () => {
    const bread = item({ category: 'pao_fresco', location: 'despensa', expires_at: '2026-11-11' });
    expect(openItem(bread, '2026-11-09', now).location).toBe('despensa');
    // Eggs only have a closed rule: opening records the date and changes nothing else.
    const eggs = item({ category: 'ovos', location: 'frigorifico', expires_at: '2026-11-30' });
    expect(openItem(eggs, '2026-11-09', now)).toMatchObject({
      location: 'frigorifico',
      expires_at: '2026-11-30',
      expiry_source: 'impressa',
    });
  });

  it('keeps an earlier printed date', () => {
    const cream = item({ category: 'natas', location: 'frigorifico', expires_at: '2026-11-11' });
    expect(openItem(cream, '2026-11-09', now)).toMatchObject({
      expires_at: '2026-11-11',
      expiry_source: 'impressa',
    });
  });

  it('keeps the date when there is no rule, and records the opening', () => {
    const other = item({ category: null, expires_at: '2026-12-01', expiry_source: 'manual' });
    expect(openItem(other, '2026-11-09', now)).toEqual({
      opened_at: now.toISOString(),
      location: 'despensa',
      expires_at: '2026-12-01',
      expiry_source: 'manual',
    });
  });
});

describe('traffic light', () => {
  it('red up to 2 days (and expired), amber up to 7, green after', () => {
    expect(lightFor(-3)).toBe('red');
    expect(lightFor(0)).toBe('red');
    expect(lightFor(2)).toBe('red');
    expect(lightFor(3)).toBe('amber');
    expect(lightFor(7)).toBe('amber');
    expect(lightFor(8)).toBe('green');
  });

  it('counts days from today in Lisbon', () => {
    const lit = light(item({ expires_at: '2026-11-11' }), '2026-11-09');
    expect(lit).toMatchObject({ daysLeft: 2, light: 'red', longLife: false });
  });

  it('marks dateless and long-life items, kept out by default', () => {
    expect(light(item({ expires_at: null, category: null }), '2026-11-09')).toMatchObject({
      daysLeft: null,
      light: null,
      longLife: true,
    });
    const rice = item({ category: 'longa_duracao', expires_at: '2027-06-01' });
    expect(light(rice, '2026-11-09').longLife).toBe(true);
  });

  it('labels the days in Portuguese', () => {
    expect(daysLabel(-4)).toBe('Expirou há 4 dias');
    expect(daysLabel(-1)).toBe('Expirou ontem');
    expect(daysLabel(0)).toBe('Expira hoje');
    expect(daysLabel(1)).toBe('Expira amanhã');
    expect(daysLabel(6)).toBe('Faltam 6 dias');
    expect(daysLabel(null)).toBe('Sem data');
  });

  it('sorts soonest first, dateless last', () => {
    const today = '2026-11-09';
    const list = [
      light(item({ id: 'a', name: 'Arroz', expires_at: null }), today),
      light(item({ id: 'b', name: 'Bife', expires_at: '2026-11-10' }), today),
      light(item({ id: 'c', name: 'Natas', expires_at: '2026-11-08' }), today),
    ].sort(bySoonest);
    expect(list.map((lit) => lit.item.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('categories', () => {
  it('guesses from the name, longest keyword first and without accents', () => {
    expect(suggestCategory('Queijo fresco Limiano')).toBe('queijo_fresco');
    expect(suggestCategory('Queijo da Serra')).toBe('queijo_curado');
    expect(suggestCategory('Leite fresco Mimosa')).toBe('leite_fresco');
    expect(suggestCategory('Leite meio-gordo')).toBe('leite_uht');
    expect(suggestCategory('Pão de forma')).toBe('pao_fresco');
    expect(suggestCategory('Carne picada de vaca')).toBe('carne_picada');
    expect(suggestCategory('Maçãs Gala')).toBe('fruta');
    expect(suggestCategory('Detergente')).toBeUndefined();
  });

  it('matches whole words only', () => {
    // "sal" must not match "salmão" or "salada".
    expect(suggestCategory('Salmão')).toBe('peixe_fresco');
    expect(suggestCategory('Salada mista')).toBe('saladas_embaladas');
  });

  it('maps Open Food Facts tags, specific before general', () => {
    expect(categoryFromOffTags(['en:dairies', 'en:fermented-milk-products', 'en:yogurts'])).toBe(
      'iogurtes',
    );
    expect(categoryFromOffTags(['en:seafood', 'en:fishes', 'en:canned-foods'])).toBe(
      'longa_duracao',
    );
    expect(categoryFromOffTags(['en:cheeses', 'en:fresh-cheeses'])).toBe('queijo_fresco');
    expect(categoryFromOffTags(['en:snacks'])).toBeUndefined();
  });

  it('knows where each category usually lives', () => {
    expect(categoryById('leite_uht')?.defaultLocation).toBe('despensa');
    expect(categoryById('fruta')?.defaultLocation).toBe('despensa');
    expect(categoryById('iogurtes')?.defaultLocation).toBe('frigorifico');
    expect(categoryById('natas')?.defaultLocation).toBe('frigorifico');
  });
});
