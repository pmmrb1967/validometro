// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The shopping list (Phase 4). What was eaten is suggested again; what was thrown away is
 * not: the list warns instead ("compraste demais?"). Entries are never deleted, only marked
 * `removido`, so the removal reaches the other phones of the household (sync).
 */
import { normalize } from './categories';
import { addDays } from './dates';
import type { IsoDate, IsoInstant, Item } from './types';

export const SHOPPING_STATES = ['sugerido', 'pendente', 'comprado', 'removido'] as const;
export type ShoppingState = (typeof SHOPPING_STATES)[number];

export interface ShoppingEntry {
  id: string;
  household_id: string;
  name: string;
  category: string | null;
  /** `auto`: suggested after something was eaten; `manual`: written by someone. */
  source: 'auto' | 'manual';
  state: ShoppingState;
  /** The item whose end suggested it (undo of "Comido" takes the suggestion back). */
  item_id: string | null;
  created_at: IsoInstant;
  updated_at: IsoInstant;
}

/** "Iogurtes Naturais " and "iogurtes naturais" are the same thing to buy. */
export function sameName(name: string): string {
  return normalize(name).replace(/\s+/g, ' ').trim();
}

/** Still to buy (or to decide): not bought, not removed. */
export function isOpen(entry: ShoppingEntry): boolean {
  return entry.state === 'sugerido' || entry.state === 'pendente';
}

/** "Comido": suggest buying it again, unless it is already on the list. */
export function restockSuggestion(
  item: Pick<Item, 'id' | 'name' | 'category' | 'household_id'>,
  list: ShoppingEntry[],
  now: Date,
): ShoppingEntry | null {
  const key = sameName(item.name);
  if (list.some((entry) => isOpen(entry) && sameName(entry.name) === key)) return null;
  const at = now.toISOString();
  return {
    id: crypto.randomUUID(),
    household_id: item.household_id,
    name: item.name,
    category: item.category,
    source: 'auto',
    state: 'sugerido',
    item_id: item.id,
    created_at: at,
    updated_at: at,
  };
}

/** How far back a thrown-away item still warns on the list. */
export const WASTE_MEMORY_DAYS = 60;

/** Names thrown away lately, for the "compraste demais?" warning. */
export function recentlyWasted(items: Item[], today: IsoDate): Set<string> {
  const since = addDays(today, -WASTE_MEMORY_DAYS);
  return new Set(
    items
      .filter(
        (item) =>
          item.status === 'deitado_fora' &&
          item.resolved_at !== null &&
          item.resolved_at.slice(0, 10) >= since,
      )
      .map((item) => sameName(item.name)),
  );
}

/**
 * Already at home: an active item with the same name, or whose name starts with what is on
 * the list ("leite" finds "Leite meio-gordo"). The one that ends soonest, so the list can say
 * "ainda tens, até sexta" before buying more.
 */
export function atHome(name: string, active: Item[]): Item | undefined {
  const key = sameName(name);
  if (!key) return undefined;
  return active
    .filter((item) => {
      if (item.status !== 'ativo') return false;
      const other = sameName(item.name);
      return other === key || other.startsWith(`${key} `);
    })
    .sort((a, b) => (a.expires_at ?? '9999').localeCompare(b.expires_at ?? '9999'))[0];
}

/** How far back the buying habits are read. */
export const HABIT_DAYS = 120;

export interface WasteHabit {
  wasted: number;
  ended: number;
}

/**
 * What tends to end in the bin: in the last months, thrown away at least twice and at least
 * half the times it ended. The list then says to buy less, or the smaller pack.
 */
export function wasteHabits(items: Item[], today: IsoDate): Map<string, WasteHabit> {
  const since = addDays(today, -HABIT_DAYS);
  const counts = new Map<string, WasteHabit>();
  for (const item of items) {
    if (
      item.status === 'ativo' ||
      item.status === 'apagado' ||
      !item.resolved_at ||
      item.resolved_at.slice(0, 10) < since
    ) {
      continue;
    }
    const key = sameName(item.name);
    const entry = counts.get(key) ?? { wasted: 0, ended: 0 };
    entry.ended++;
    if (item.status === 'deitado_fora') entry.wasted++;
    counts.set(key, entry);
  }
  return new Map(
    [...counts].filter(([, habit]) => habit.wasted >= 2 && habit.wasted * 2 >= habit.ended),
  );
}

/** Suggestions first, then what to buy (oldest first), then what is in the cart. */
export function shoppingOrder(a: ShoppingEntry, b: ShoppingEntry): number {
  const rank: Record<ShoppingState, number> = {
    sugerido: 0,
    pendente: 1,
    comprado: 2,
    removido: 3,
  };
  return rank[a.state] - rank[b.state] || a.created_at.localeCompare(b.created_at);
}
