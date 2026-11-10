// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The shopping list on this phone (IndexedDB), shared with the household once there is an
 * account (sync.ts). Changes are queued like the items' (store/items.ts).
 */
import { suggestCategory } from '../../domain/categories';
import { isOpen, sameName, type ShoppingEntry, type ShoppingState } from '../../domain/shopping';
import { db, LOCAL_HOUSEHOLD, resolveItem, writeShopping } from './items';

/** Everything not removed (the screen sorts and hides). */
export async function shoppingList(store = db): Promise<ShoppingEntry[]> {
  return store.shopping.where('state').notEqual('removido').toArray();
}

/** "Leite": added, unless it is already waiting on the list (then that one is kept). */
export async function addToList(name: string, now = new Date(), store = db): Promise<void> {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) return;
  const list = await shoppingList(store);
  const same = list.find((entry) => isOpen(entry) && sameName(entry.name) === sameName(clean));
  if (same) {
    // A suggestion someone now writes by hand: it is wanted.
    if (same.state === 'sugerido') await setShoppingState(same.id, 'pendente', now, store);
    return;
  }
  const at = now.toISOString();
  const household = (await store.meta.get('household'))?.value;
  await writeShopping(store, {
    id: crypto.randomUUID(),
    household_id: typeof household === 'string' ? household : LOCAL_HOUSEHOLD,
    name: clean,
    category: suggestCategory(clean) ?? null,
    source: 'manual',
    state: 'pendente',
    item_id: null,
    created_at: at,
    updated_at: at,
  });
}

export async function setShoppingState(
  id: string,
  state: ShoppingState,
  now = new Date(),
  store = db,
): Promise<void> {
  const entry = await store.shopping.get(id);
  if (!entry || entry.state === state) return;
  await writeShopping(store, { ...entry, state, updated_at: now.toISOString() });
}

/** "Limpar comprados": out of the list (and of the other phones' lists). */
export async function clearBought(now = new Date(), store = db): Promise<void> {
  const bought = await store.shopping.where('state').equals('comprado').toArray();
  for (const entry of bought) {
    await writeShopping(store, { ...entry, state: 'removido', updated_at: now.toISOString() });
  }
}

/** "Está a acabar": on the list to buy, while what is left stays at home. */
export async function runningLow(
  item: { name: string },
  now = new Date(),
  store = db,
): Promise<void> {
  await addToList(item.name, now, store);
}

/** "Acabou": out of the house and straight onto the list (not just a suggestion). */
export async function finished(id: string, now = new Date(), store = db): Promise<void> {
  const item = await store.items.get(id);
  if (!item) return;
  await resolveItem(id, 'consumido', now, store);
  await addToList(item.name, now, store);
}

/** Undo of "Está a acabar" / "Acabou": off the list again, if nobody bought it yet. */
export async function takeOffList(name: string, now = new Date(), store = db): Promise<void> {
  const list = await shoppingList(store);
  for (const entry of list) {
    if (isOpen(entry) && sameName(entry.name) === sameName(name)) {
      await setShoppingState(entry.id, 'removido', now, store);
    }
  }
}
