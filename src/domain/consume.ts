// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Using things up, in the words of the house: milk and water are drunk ("Bebido", "Bebi 1"),
 * the rest eaten. A pack of several ("6 cervejas", "4 iogurtes") goes one at a time, and the
 * pantry staples a household follows say "Está a acabar" instead of a date nobody watches.
 */
import { normalize } from './categories';
import { addDays } from './dates';
import { isLongLife } from './shelf-life';
import { sameName } from './shopping';
import type { IsoDate, Item } from './types';

const DRINK_CATEGORIES = new Set(['bebidas', 'leite_uht', 'leite_fresco']);
const DRINK_WORDS =
  /\b(agua|aguas|sumo|sumos|nectar|cerveja|cervejas|vinho|vinhos|refrigerante|refrigerantes|leite|bebida|bebidas|cha frio|kefir liquido|iogurte liquido|limonada|cola|tonica|espumante)\b/;

export function isDrink(item: Pick<Item, 'name' | 'category'>): boolean {
  if (item.category && DRINK_CATEGORIES.has(item.category)) return true;
  return DRINK_WORDS.test(normalize(item.name));
}

/** "Comido" / "Bebido", the button and the message. */
export function usedWord(item: Pick<Item, 'name' | 'category'>): 'Comido' | 'Bebido' {
  return isDrink(item) ? 'Bebido' : 'Comido';
}

/** Units that are counted one by one ("un.", "emb.", latas…), or none written. */
const COUNTED = /^(un|und|unid|unidades?|emb|embalagens?|x|×|latas?|garrafas?|pacotes?)\.?$/i;

/** Several of something countable: "Comi 1" / "Bebi 1" takes one off. */
export function canTakeOne(item: Pick<Item, 'quantity' | 'unit'>): boolean {
  if (item.quantity === null || item.quantity < 2 || !Number.isInteger(item.quantity)) {
    return false;
  }
  return item.unit === null || COUNTED.test(item.unit.trim());
}

/** "Comi 1" / "Bebi 1". */
export function takeOneLabel(item: Pick<Item, 'name' | 'category'>): string {
  return isDrink(item) ? 'Bebi 1' : 'Comi 1';
}

/** How far back a pantry staple saved by the household still counts as followed. */
export const TRACKED_DAYS = 365;

/**
 * The long-life things this household follows: those it chose to save (from a receipt or by
 * hand) in the last year. Next receipts bring them ticked; the rest stay out (principle 1).
 */
export function trackedStaples(items: Item[], today: IsoDate): Set<string> {
  const since = addDays(today, -TRACKED_DAYS);
  return new Set(
    items
      .filter((item) => isLongLife(item.category) && item.created_at.slice(0, 10) >= since)
      .map((item) => sameName(item.name)),
  );
}
