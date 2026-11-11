// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Recipes the AI suggested, kept with the items they use, so they can be seen again without
 * asking (and spending) again. Shared with the household like the shopping list (sync.ts);
 * never deleted, only marked 'removida', so a removal reaches every phone.
 */
import { sameName } from './shopping';
import type { IsoInstant } from './types';

export const RECIPE_STATES = ['nova', 'feita', 'removida'] as const;
export type RecipeState = (typeof RECIPE_STATES)[number];

export interface SavedRecipe {
  id: string;
  household_id: string;
  title: string;
  minutes: number;
  /** The names of what it uses from home, as the AI wrote them. */
  usa: string[];
  falta: string[];
  steps: string[];
  /** The items it was suggested for (the ones about to go off). */
  item_ids: string[];
  /** "Guardar": kept even after its items are gone. */
  starred: boolean;
  state: RecipeState;
  created_at: IsoInstant;
  updated_at: IsoInstant;
}

/** Not starred, not for anything at home any more: still listed this long, then hidden. */
export const PAST_DAYS = 30;

/**
 * Which of the items the recipe uses: the names in `usa` against the items' names (either
 * contains the other: "frango" and "Peito de frango"). None recognised: all of them, since
 * the recipe was asked for those.
 */
export function linkItems(usa: readonly string[], items: readonly { id: string; name: string }[]) {
  const wanted = usa.map(sameName).filter(Boolean);
  const linked = items.filter((item) => {
    const name = sameName(item.name);
    return wanted.some((word) => name.includes(word) || word.includes(name));
  });
  return (linked.length ? linked : items).map((item) => item.id);
}

export interface RecipeGroups {
  /** For something still at home: the first to look at. */
  current: SavedRecipe[];
  /** Starred, for nothing at home now. */
  starred: SavedRecipe[];
  /** The rest of the last PAST_DAYS days. */
  past: SavedRecipe[];
}

export function groupRecipes(
  recipes: readonly SavedRecipe[],
  activeIds: ReadonlySet<string>,
  now: Date,
): RecipeGroups {
  const since = now.getTime() - PAST_DAYS * 86_400_000;
  const newest = [...recipes]
    .filter((recipe) => recipe.state !== 'removida')
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const groups: RecipeGroups = { current: [], starred: [], past: [] };
  for (const recipe of newest) {
    if (recipe.state !== 'feita' && recipe.item_ids.some((id) => activeIds.has(id))) {
      groups.current.push(recipe);
    } else if (recipe.starred) {
      groups.starred.push(recipe);
    } else if (Date.parse(recipe.created_at) >= since) {
      groups.past.push(recipe);
    }
  }
  return groups;
}

/** How many recipes still to make use each item (for the "2 receitas" on its card). */
export function recipesPerItem(recipes: readonly SavedRecipe[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const recipe of recipes) {
    if (recipe.state !== 'nova') continue;
    for (const id of recipe.item_ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
