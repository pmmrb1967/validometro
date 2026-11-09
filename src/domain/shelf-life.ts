// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Fallback shelf life, used only when there is no printed date (CLAUDE.md, principle 5).
 * The same rows as the D1 seed (migrations/0002_seed_shelf_life_rules.sql): the app needs
 * them offline and without an account; test/shelf-life-sync.test.ts keeps both equal.
 */
import { addDays } from './dates';
import type { IsoDate, Item, Location, OpenState } from './types';

export interface ShelfLifeRule {
  category: string;
  location: Location;
  state: OpenState;
  /** Null: long life, kept out of the traffic light. */
  days_default: number | null;
  label: string;
  notes: string | null;
}

const r = (
  category: string,
  location: Location,
  state: OpenState,
  days: number | null,
  label: string,
  notes: string | null = null,
): ShelfLifeRule => ({ category, location, state, days_default: days, label, notes });

export const SHELF_LIFE_RULES: readonly ShelfLifeRule[] = [
  r('carne_picada', 'frigorifico', 'fechado', 1, 'Carne picada'),
  r('carne_picada', 'frigorifico', 'aberto', 1, 'Carne picada'),
  r('carne_fresca', 'frigorifico', 'fechado', 2, 'Carne fresca (bifes, frango)'),
  r('carne_fresca', 'frigorifico', 'aberto', 2, 'Carne fresca (bifes, frango)'),
  r('peixe_fresco', 'frigorifico', 'fechado', 1, 'Peixe fresco'),
  r('peixe_fresco', 'frigorifico', 'aberto', 1, 'Peixe fresco'),
  r('charcutaria_fatiada', 'frigorifico', 'aberto', 4, 'Fiambre / charcutaria fatiada'),
  r('queijo_fresco', 'frigorifico', 'aberto', 4, 'Queijo fresco'),
  r('queijo_curado', 'frigorifico', 'aberto', 21, 'Queijo curado'),
  r('leite_uht', 'despensa', 'fechado', 90, 'Leite UHT', 'Usar a data impressa'),
  r('leite_uht', 'frigorifico', 'aberto', 4, 'Leite UHT'),
  r('leite_fresco', 'frigorifico', 'fechado', 5, 'Leite fresco pasteurizado'),
  r('leite_fresco', 'frigorifico', 'aberto', 4, 'Leite fresco pasteurizado'),
  r('iogurtes', 'frigorifico', 'fechado', 21, 'Iogurtes', 'Usar a data impressa'),
  r('natas', 'frigorifico', 'aberto', 4, 'Natas'),
  r('ovos', 'frigorifico', 'fechado', 21, 'Ovos'),
  r('pao_fresco', 'despensa', 'fechado', 2, 'Pão fresco'),
  r('pao_fresco', 'despensa', 'aberto', 2, 'Pão fresco'),
  r('fruta', 'despensa', 'fechado', 5, 'Fruta'),
  r('fruta', 'despensa', 'aberto', 5, 'Fruta'),
  r('fruta', 'frigorifico', 'fechado', 5, 'Fruta'),
  r('fruta', 'frigorifico', 'aberto', 5, 'Fruta'),
  r('legumes', 'frigorifico', 'fechado', 4, 'Legumes'),
  r('saladas_embaladas', 'frigorifico', 'fechado', 4, 'Saladas embaladas'),
  r('saladas_embaladas', 'frigorifico', 'aberto', 1, 'Saladas embaladas'),
  r('sobras', 'frigorifico', 'fechado', 3, 'Sobras cozinhadas'),
  r('sobras', 'frigorifico', 'aberto', 3, 'Sobras cozinhadas'),
  r('congelados', 'congelador', 'fechado', 120, 'Congelados (genérico)'),
  r('congelados', 'congelador', 'aberto', 120, 'Congelados (genérico)'),
  r('congelado_em_casa', 'congelador', 'fechado', 90, 'Carne/peixe congelado em casa'),
  r('congelado_em_casa', 'congelador', 'aberto', 90, 'Carne/peixe congelado em casa'),
  r('molhos_frascos', 'frigorifico', 'aberto', 14, 'Molhos / frascos'),
  r(
    'longa_duracao',
    'despensa',
    'fechado',
    null,
    'Enlatados / massa / arroz',
    'Longa duração (fora do semáforo)',
  ),
];

/**
 * The closest rule: exact match; else the same category and state elsewhere (opened UHT milk
 * lives in the fridge; fruit kept somewhere unusual); else the same place in the other state.
 * Undefined: no rule.
 */
export function findRule(
  category: string | null,
  location: Location,
  state: OpenState,
  rules: readonly ShelfLifeRule[] = SHELF_LIFE_RULES,
): ShelfLifeRule | undefined {
  if (!category) return undefined;
  const same = rules.filter((rule) => rule.category === category);
  return (
    same.find((rule) => rule.location === location && rule.state === state) ??
    same.find((rule) => rule.state === state) ??
    same.find((rule) => rule.location === location)
  );
}

/** Whether the category is long-life (pantry staples): out of the traffic light by default. */
export function isLongLife(category: string | null): boolean {
  if (!category) return false;
  const rules = SHELF_LIFE_RULES.filter((rule) => rule.category === category);
  return rules.length > 0 && rules.every((rule) => rule.days_default === null);
}

/** Suggested expiry from the rules, counting from `from`; null when there is no estimate. */
export function suggestExpiry(
  category: string | null,
  location: Location,
  state: OpenState,
  from: IsoDate,
): IsoDate | null {
  const days = findRule(category, location, state)?.days_default;
  return days == null ? null : addDays(from, days);
}

/**
 * "Abri isto": opening shortens the effective expiry (principle 4). The opened estimate only
 * ever brings the date forward: a printed date that is earlier still wins. When the opened rule
 * only exists elsewhere (UHT milk: closed in the pantry, opened in the fridge), the item moves.
 */
export function openItem(
  item: Item,
  today: IsoDate,
  now: Date,
): Pick<Item, 'opened_at' | 'expires_at' | 'expiry_source' | 'location'> {
  const rule = findRule(item.category, item.location, 'aberto');
  const usable = rule?.state === 'aberto' ? rule : undefined;
  const opened = usable?.days_default == null ? null : addDays(today, usable.days_default);
  const keep = !opened || (item.expires_at !== null && item.expires_at <= opened);
  const elsewhere = usable && !findExact(item.category, item.location, 'aberto');
  return {
    opened_at: now.toISOString(),
    location: elsewhere ? usable.location : item.location,
    expires_at: keep ? item.expires_at : opened,
    expiry_source: keep ? item.expiry_source : 'estimada',
  };
}

function findExact(category: string | null, location: Location, state: OpenState) {
  return SHELF_LIFE_RULES.find(
    (rule) => rule.category === category && rule.location === location && rule.state === state,
  );
}
