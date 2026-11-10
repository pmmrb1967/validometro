// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * "Congelei": meat, fish, bread or leftovers that will not be eaten in time go to the freezer
 * on their last days instead of the bin. One tap moves the item and gives it the home-frozen
 * shelf life ("Carne/peixe congelado em casa" in the rules). Taking it out again is "Abri
 * isto" in the freezer: the opened rule moves it back to the fridge with a short date.
 */
import { addDays } from './dates';
import { effectiveKind } from './date-kind';
import { AMBER_MAX_DAYS } from './traffic-light';
import { findRule } from './shelf-life';
import type { IsoDate, Item } from './types';

/** What freezes well at home, by category. */
export const FREEZABLE = new Set([
  'carne_picada',
  'carne_fresca',
  'peixe_fresco',
  'charcutaria_fatiada',
  'pao_fresco',
  'sobras',
  'leite_fresco',
  'fruta',
]);

/** Days in the freezer, from the rules (90 today); a fallback if the rule ever goes. */
export function frozenDays(): number {
  return findRule('congelado_em_casa', 'congelador', 'fechado')?.days_default ?? 90;
}

/**
 * Offered on its last week, while it is still good to freeze: not after a "consumir até"
 * date has passed (then it is too late), and not for what is already frozen.
 */
export function canFreeze(
  item: Pick<Item, 'category' | 'location' | 'opened_at' | 'expiry_kind'>,
  daysLeft: number | null,
): boolean {
  if (item.location === 'congelador' || !item.category || !FREEZABLE.has(item.category)) {
    return false;
  }
  if (daysLeft === null || daysLeft > AMBER_MAX_DAYS) return false;
  return daysLeft >= 0 || effectiveKind(item) === 'consumir_de_preferencia';
}

/** A frozen item is taken out with the opened rule, which sends it back to the fridge. */
export function canThaw(item: Pick<Item, 'category' | 'location'>): boolean {
  return item.location === 'congelador' && !!item.category && FREEZABLE.has(item.category);
}

export function freezeItem(
  today: IsoDate,
): Pick<Item, 'location' | 'expires_at' | 'expiry_source' | 'expiry_kind' | 'opened_at'> {
  return {
    location: 'congelador',
    // Out of the freezer it counts as opened again ("Tirei do congelador").
    opened_at: null,
    expires_at: addDays(today, frozenDays()),
    expiry_source: 'estimada',
    expiry_kind: null,
  };
}
