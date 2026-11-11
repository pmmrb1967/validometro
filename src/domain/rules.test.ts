// SPDX-License-Identifier: AGPL-3.0-or-later
// A household's own shelf-life days (shelf-life.ts) and moving the dates estimated with
// them (reestimate.ts).
import { afterEach, describe, expect, it } from 'vitest';
import { estimatedUnder, governingRuleKey, shifted } from './reestimate';
import {
  findRule,
  isEditableRule,
  ruleKey,
  setRuleOverrides,
  suggestExpiry,
  withOverrides,
} from './shelf-life';
import type { Item } from './types';

function item(overrides: Partial<Item>): Item {
  return {
    id: 'i',
    household_id: 'local',
    created_by: null,
    name: 'Leite',
    category: 'leite_fresco',
    location: 'frigorifico',
    ean: null,
    quantity: null,
    unit: null,
    purchased_at: '2026-11-08T10:00:00.000Z',
    opened_at: null,
    expires_at: '2026-11-13',
    expiry_source: 'estimada',
    status: 'ativo',
    resolved_at: null,
    created_at: '2026-11-08T10:00:00.000Z',
    ...overrides,
  };
}

const MILK = { category: 'leite_fresco', location: 'frigorifico', state: 'fechado' } as const;

afterEach(() => setRuleOverrides([]));

describe("a household's own days", () => {
  it('replace the default in every estimate', () => {
    expect(suggestExpiry('leite_fresco', 'frigorifico', 'fechado', '2026-11-10')).toBe(
      '2026-11-15',
    );
    setRuleOverrides([{ ...MILK, days: 3 }]);
    expect(findRule('leite_fresco', 'frigorifico', 'fechado')?.days_default).toBe(3);
    expect(suggestExpiry('leite_fresco', 'frigorifico', 'fechado', '2026-11-10')).toBe(
      '2026-11-13',
    );
    // Opened milk keeps its own rule.
    expect(findRule('leite_fresco', 'frigorifico', 'aberto')?.days_default).toBe(4);
    setRuleOverrides([]);
    expect(findRule('leite_fresco', 'frigorifico', 'fechado')?.days_default).toBe(5);
  });

  it('only for rules with days: long life stays long life, unknown rules are ignored', () => {
    expect(isEditableRule(MILK)).toBe(true);
    expect(
      isEditableRule({ category: 'longa_duracao', location: 'despensa', state: 'fechado' }),
    ).toBe(false);
    expect(isEditableRule({ category: 'nada', location: 'despensa', state: 'fechado' })).toBe(
      false,
    );
    const rules = withOverrides([
      { category: 'longa_duracao', location: 'despensa', state: 'fechado', days: 5 },
    ]);
    expect(rules.find((rule) => rule.category === 'longa_duracao')?.days_default).toBeNull();
  });
});

describe('moving the estimated dates', () => {
  it('moves by the difference, only what was estimated with that rule', () => {
    const items = [
      item({ id: 'a' }),
      item({ id: 'b', expiry_source: 'impressa' }),
      item({ id: 'c', status: 'consumido' }),
      item({ id: 'd', opened_at: '2026-11-09T08:00:00.000Z' }),
      item({ id: 'e', category: 'iogurtes' }),
    ];
    expect(estimatedUnder(items, ruleKey(MILK)).map((one) => one.id)).toEqual(['a']);
    expect(shifted('2026-11-13', 5, 3)).toBe('2026-11-11');
    expect(shifted('2026-11-13', 5, 7)).toBe('2026-11-15');
  });

  it('counts what was frozen at home as "congelado em casa", not as its kind', () => {
    const frozen = item({ location: 'congelador', category: 'carne_fresca' });
    expect(governingRuleKey(frozen)).toBe(
      ruleKey({ category: 'congelado_em_casa', location: 'congelador', state: 'fechado' }),
    );
    expect(governingRuleKey(item({ category: 'congelados', location: 'congelador' }))).toBe(
      ruleKey({ category: 'congelados', location: 'congelador', state: 'fechado' }),
    );
  });
});
