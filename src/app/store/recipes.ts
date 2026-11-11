// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Saved recipes on this phone (IndexedDB), shared with the household once there is an
 * account (sync.ts). Every suggestion is kept, with the items it was asked for.
 */
import { linkItems, type SavedRecipe } from '../../domain/recipes';
import type { Recipe } from '../api';
import { db, LOCAL_HOUSEHOLD, resolveItem, writeRecipe } from './items';

export async function savedRecipes(store = db): Promise<SavedRecipe[]> {
  return store.recipes.where('state').notEqual('removida').toArray();
}

/** What the AI suggested, kept with the items it was asked for. */
export async function keepSuggestions(
  recipes: readonly Recipe[],
  items: readonly { id: string; name: string }[],
  now = new Date(),
  store = db,
): Promise<SavedRecipe[]> {
  const at = now.toISOString();
  const household = (await store.meta.get('household'))?.value;
  const kept: SavedRecipe[] = [];
  for (const recipe of recipes) {
    const saved: SavedRecipe = {
      id: crypto.randomUUID(),
      household_id: typeof household === 'string' ? household : LOCAL_HOUSEHOLD,
      title: recipe.title.charAt(0).toUpperCase() + recipe.title.slice(1),
      minutes: recipe.minutes,
      usa: recipe.usa,
      falta: recipe.falta,
      steps: recipe.steps,
      item_ids: linkItems(recipe.usa, items),
      starred: false,
      state: 'nova',
      created_at: at,
      updated_at: at,
    };
    await writeRecipe(store, saved);
    kept.push(saved);
  }
  return kept;
}

async function change(
  id: string,
  changes: Partial<Pick<SavedRecipe, 'starred' | 'state'>>,
  now: Date,
  store: typeof db,
): Promise<void> {
  const recipe = await store.recipes.get(id);
  if (!recipe) return;
  await writeRecipe(store, { ...recipe, ...changes, updated_at: now.toISOString() });
}

/** "Guardar ⭐": kept after its items are gone. */
export function starRecipe(id: string, starred: boolean, now = new Date(), store = db) {
  return change(id, { starred }, now, store);
}

/** "Fiz esta": out of "Para o que tens agora", and optionally its items eaten. */
export async function madeRecipe(
  id: string,
  eatenIds: readonly string[],
  now = new Date(),
  store = db,
): Promise<void> {
  await change(id, { state: 'feita' }, now, store);
  for (const item of eatenIds) await resolveItem(item, 'consumido', now, store);
}

export function removeRecipe(id: string, now = new Date(), store = db) {
  return change(id, { state: 'removida' }, now, store);
}

/** "Anular" after "Fiz esta" or "Apagar". */
export function restoreRecipe(id: string, now = new Date(), store = db) {
  return change(id, { state: 'nova' }, now, store);
}
