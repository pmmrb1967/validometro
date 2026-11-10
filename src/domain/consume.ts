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

/** Grams or millilitres in one of each unit; kg and g are weight, L/cl/ml volume. */
const MEASURES: Record<string, { dimension: 'weight' | 'volume'; base: number }> = {
  g: { dimension: 'weight', base: 1 },
  gr: { dimension: 'weight', base: 1 },
  kg: { dimension: 'weight', base: 1000 },
  ml: { dimension: 'volume', base: 1 },
  cl: { dimension: 'volume', base: 10 },
  l: { dimension: 'volume', base: 1000 },
  lt: { dimension: 'volume', base: 1000 },
};

function measureOf(unit: string | null) {
  return unit ? MEASURES[unit.trim().toLowerCase().replace(/\.$/, '')] : undefined;
}

/** Sold by weight or volume ("1,178 kg", "1 L"): "Comi uma parte" asks how much. */
export function canEatPart(item: Pick<Item, 'quantity' | 'unit'>): boolean {
  return item.quantity !== null && item.quantity > 0 && measureOf(item.unit) !== undefined;
}

/** "Comi uma parte" / "Bebi uma parte". */
export function eatPartLabel(item: Pick<Item, 'name' | 'category'>): string {
  return isDrink(item) ? 'Bebi uma parte' : 'Comi uma parte';
}

/** Rounded the way a kitchen scale shows it: 0.778 kg, 250 g. */
function tidy(amount: number): number {
  return Math.round(amount * 1000) / 1000;
}

/**
 * What is left after eating `eaten` ("400 g", "0,4 kg", "400"), in the item's own unit; null
 * when it cannot be read or is in another kind of unit (litres of a weight). A bare number on
 * something in kg or L is taken as grams or millilitres when it is 10 or more ("400").
 */
export function leftAfterEating(
  item: Pick<Item, 'quantity' | 'unit'>,
  eaten: string,
): number | null {
  const own = measureOf(item.unit);
  if (item.quantity === null || !own) return null;
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+\.?)?\s*$/.exec(eaten);
  if (!match) return null;
  const amount = Number(match[1]!.replace(',', '.'));
  if (!(amount > 0)) return null;
  let measure = match[2] ? measureOf(match[2]) : own;
  if (!measure || measure.dimension !== own.dimension) return null;
  if (!match[2] && own.base === 1000 && amount >= 10) measure = { ...own, base: 1 };
  return Math.max(0, tidy(item.quantity - (amount * measure.base) / own.base));
}

/** "Metade" / "Um pouco" (a quarter): what is left, in the item's unit. */
export function leftAfterShare(item: Pick<Item, 'quantity'>, share: 'metade' | 'pouco'): number {
  return tidy((item.quantity ?? 0) * (share === 'metade' ? 0.5 : 0.75));
}
