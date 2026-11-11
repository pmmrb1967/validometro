// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Local inventory (IndexedDB, no account): the same rows as D1 `items`, so they move to the
 * server unchanged when the family creates an account (Phase 3). Nothing here leaves the phone.
 */
import Dexie, { type Table } from 'dexie';
import { lisbonDate } from '../../domain/dates';
import { freezeItem } from '../../domain/freeze';
import { moveItem } from '../../domain/move';
import type { SavedRecipe } from '../../domain/recipes';
import type { SeenReceipt } from '../../domain/receipts';
import { estimatedUnder, shifted } from '../../domain/reestimate';
import { openItem } from '../../domain/shelf-life';
import { restockSuggestion, type ShoppingEntry } from '../../domain/shopping';
import type { ExpiryKind, ExpirySource, IsoDate, Item, Location } from '../../domain/types';
import { categorize } from '../../domain/reestimate';

/** Household id of the account-less inventory. */
export const LOCAL_HOUSEHOLD = 'local';

/** An item changed here and not yet confirmed by the server (sync.ts). */
export interface PendingChange {
  id: string;
  /** Which table: items (absent, as before), the shopping list or the saved recipes. */
  kind?: 'shopping' | 'recipe' | 'receipt';
  /** The item's updated_at when queued: a later change re-queues it. */
  updated_at: string;
}

export interface Meta {
  key: string;
  value: string | number;
}

export class InventoryDb extends Dexie {
  items!: Table<Item, string>;
  shopping!: Table<ShoppingEntry, string>;
  outbox!: Table<PendingChange, string>;
  meta!: Table<Meta, string>;
  recipes!: Table<SavedRecipe, string>;
  receipts!: Table<SeenReceipt, string>;

  constructor(name = 'validometro') {
    super(name);
    this.version(1).stores({
      // Only indexed fields here; the rest of the row is stored as is.
      items: 'id, status, [status+expires_at], location, ean',
    });
    // Accounts (Phase 3): changes waiting to go to the server, and the sync cursor.
    this.version(2).stores({ outbox: 'id', meta: 'key' });
    // The shopping list (Phase 4).
    this.version(3).stores({ shopping: 'id, state' });
    // Saved recipes (0.12).
    this.version(4).stores({ recipes: 'id, state' });
    // Receipts already saved, to tell the same one read twice (0.16).
    this.version(5).stores({ receipts: 'id, qr_hash' });
  }
}

/** Told after every local change, so the app can sync soon (sync.ts). */
export const localChangeListeners = new Set<() => void>();

function changed(): void {
  for (const listener of localChangeListeners) listener();
}

/** Writes a change with its time, and queues it for the server, in one transaction. */
async function write(store: InventoryDb, item: Item): Promise<void> {
  const updated_at = item.updated_at ?? new Date().toISOString();
  await store.transaction('rw', store.items, store.outbox, async () => {
    await store.items.put({ ...item, updated_at });
    await store.outbox.put({ id: item.id, updated_at });
  });
  changed();
}

/** The same for a saved recipe. */
export async function writeRecipe(store: InventoryDb, recipe: SavedRecipe): Promise<void> {
  await store.transaction('rw', store.recipes, store.outbox, async () => {
    await store.recipes.put(recipe);
    await store.outbox.put({ id: recipe.id, updated_at: recipe.updated_at, kind: 'recipe' });
  });
  changed();
}

/** The same for the note of a receipt saved. */
export async function writeReceipt(store: InventoryDb, receipt: SeenReceipt): Promise<void> {
  await store.transaction('rw', store.receipts, store.outbox, async () => {
    await store.receipts.put(receipt);
    await store.outbox.put({ id: receipt.id, updated_at: receipt.updated_at, kind: 'receipt' });
  });
  changed();
}

/** The same for a shopping-list entry. */
export async function writeShopping(store: InventoryDb, entry: ShoppingEntry): Promise<void> {
  await store.transaction('rw', store.shopping, store.outbox, async () => {
    await store.shopping.put(entry);
    await store.outbox.put({ id: entry.id, updated_at: entry.updated_at, kind: 'shopping' });
  });
  changed();
}

async function update(
  store: InventoryDb,
  id: string,
  changes: Partial<Item>,
  now: Date,
): Promise<Item | undefined> {
  const item = await store.items.get(id);
  if (!item) return undefined;
  const next = { ...item, ...changes, updated_at: now.toISOString() };
  await write(store, next);
  return next;
}

export const db = new InventoryDb();

/**
 * A rule changed from `fromDays` to `toDays`: the items estimated with it move by the
 * difference (domain/reestimate.ts). Returns how many moved.
 */
export async function reestimateItems(
  key: string,
  fromDays: number,
  toDays: number,
  now = new Date(),
  store = db,
): Promise<number> {
  if (fromDays === toDays) return 0;
  const items = estimatedUnder(await store.items.where('status').equals('ativo').toArray(), key);
  for (const item of items) {
    await update(store, item.id, { expires_at: shifted(item.expires_at!, fromDays, toDays) }, now);
  }
  return items.length;
}

/** How many items a change of this rule would move. */
export async function countEstimatedUnder(key: string, store = db): Promise<number> {
  return estimatedUnder(await store.items.where('status').equals('ativo').toArray(), key).length;
}

export interface NewItem {
  name: string;
  category: string | null;
  location: Location;
  expires_at: IsoDate | null;
  expiry_source: ExpirySource | null;
  /** "Consumir até" or "de preferência", when the package says. */
  expiry_kind?: ExpiryKind | null;
  /** Euros; optional, always. */
  price?: number | null;
  /** Optional, always. */
  quantity?: number | null;
  unit?: string | null;
  ean?: string | null;
  /** Already open when registered (e.g. leftovers, a jar from the cupboard). */
  opened?: boolean;
}

export async function addItem(input: NewItem, now = new Date(), store = db): Promise<Item> {
  const at = now.toISOString();
  const item: Item = {
    id: crypto.randomUUID(),
    household_id: LOCAL_HOUSEHOLD,
    created_by: null,
    name: input.name.trim(),
    category: input.category,
    location: input.location,
    ean: input.ean ?? null,
    quantity: input.quantity ?? null,
    unit: input.unit?.trim() || null,
    purchased_at: at,
    opened_at: input.opened ? at : null,
    expires_at: input.expires_at,
    expiry_source: input.expires_at ? input.expiry_source : null,
    expiry_kind: input.expires_at ? (input.expiry_kind ?? null) : null,
    price: input.price ?? null,
    status: 'ativo',
    resolved_at: null,
    created_at: at,
    updated_at: at,
  };
  await write(store, item);
  return item;
}

/** "Comido" / "Deitado fora": the item leaves the traffic light (and feeds stats later). */
export async function resolveItem(
  id: string,
  status: 'consumido' | 'deitado_fora',
  now = new Date(),
  store = db,
): Promise<void> {
  // One transaction: closing the app right after the tap keeps both or neither.
  await store.transaction('rw', store.items, store.shopping, store.outbox, async () => {
    const item = await update(store, id, { status, resolved_at: now.toISOString() }, now);
    // Eaten: suggest buying it again (thrown away: no, the list warns instead).
    if (item && status === 'consumido') {
      const suggestion = restockSuggestion(item, await store.shopping.toArray(), now);
      if (suggestion) await writeShopping(store, suggestion);
    }
  });
}

/**
 * "Registado por engano? Apagar": out of the inventory, not eaten nor thrown away, nothing on
 * the shopping list. The row stays as 'apagado' so the other phones of the house drop it too.
 */
export async function deleteItem(id: string, now = new Date(), store = db): Promise<void> {
  await update(store, id, { status: 'apagado', resolved_at: now.toISOString() }, now);
}

/** Undo of a resolve (or of a deletion), from the snackbar. */
export async function reactivateItem(id: string, now = new Date(), store = db): Promise<void> {
  await store.transaction('rw', store.items, store.shopping, store.outbox, async () => {
    await update(store, id, { status: 'ativo', resolved_at: null }, now);
    // Undo of "Comido": the suggestion it made goes too, if nobody acted on it yet.
    const suggested = await store.shopping
      .where('state')
      .equals('sugerido')
      .filter((entry) => entry.item_id === id)
      .toArray();
    for (const entry of suggested) {
      await writeShopping(store, { ...entry, state: 'removido', updated_at: now.toISOString() });
    }
  });
}

/** "Abri isto": records the opening and brings the expiry forward by the opened rule. */
export async function markOpened(
  id: string,
  now = new Date(),
  store = db,
): Promise<Item | undefined> {
  const item = await store.items.get(id);
  if (!item || item.opened_at) return item;
  return update(store, id, openItem(item, lisbonDate(now), now), now);
}

/** "Editar data": the user's own date always wins; the kind too, when given. */
export async function setExpiry(
  id: string,
  expiresAt: IsoDate,
  kind?: ExpiryKind | null,
  now = new Date(),
  store = db,
): Promise<void> {
  await update(
    store,
    id,
    {
      expires_at: expiresAt,
      expiry_source: 'manual',
      ...(kind !== undefined ? { expiry_kind: kind } : {}),
    },
    now,
  );
}

/** "Que tipo é?" (Sem data): the kind, and the estimate it brings (domain/reestimate.ts). */
export async function setCategory(
  id: string,
  category: string,
  now = new Date(),
  store = db,
): Promise<Item | undefined> {
  const item = await store.items.get(id);
  if (!item) return undefined;
  await update(store, id, categorize(item, category), now);
  return item;
}

/** "Congelei": into the freezer, with the home-frozen shelf life. Returns the item before. */
export async function freeze(id: string, now = new Date(), store = db): Promise<Item | undefined> {
  const item = await store.items.get(id);
  if (!item || item.location === 'congelador') return undefined;
  await update(store, id, freezeItem(lisbonDate(now)), now);
  return item;
}

/** To another place (domain/move.ts). Returns the item as it was, for "Anular". */
export async function moveTo(
  id: string,
  to: Location,
  now = new Date(),
  store = db,
): Promise<{ before: Item; after: Item } | undefined> {
  const item = await store.items.get(id);
  if (!item || item.location === to) return undefined;
  const after = await update(store, id, moveItem(item, to, lisbonDate(now)), now);
  return after && { before: item, after };
}

/** Undo of "Congelei" or "Abri isto": the item as it was, as a new change. */
export async function restoreItem(before: Item, now = new Date(), store = db): Promise<void> {
  await update(store, before.id, { ...before }, now);
}

export async function activeItems(store = db): Promise<Item[]> {
  return store.items.where('status').equals('ativo').toArray();
}

/** "Comi 1" / "Bebi 1": one less of several. Returns how many are left. */
export async function takeOne(id: string, now = new Date(), store = db): Promise<number | null> {
  const item = await store.items.get(id);
  if (!item || item.quantity === null || item.quantity < 2) return null;
  const left = item.quantity - 1;
  await update(store, id, { quantity: left, price: priceOfRest(item, left) }, now);
  return left;
}

/**
 * The price follows what is left (a share of it eaten), so throwing the rest away later
 * counts only the rest as waste.
 */
function priceOfRest(item: Item, left: number): number | null {
  if (item.price == null || item.quantity === null || item.quantity <= 0) return item.price ?? null;
  return Math.round(((item.price * left) / item.quantity) * 100) / 100;
}

/**
 * "Comi uma parte": `left` is what remains, in the item's unit. Nothing left: eaten.
 * Returns the item as it was, for "Anular".
 */
export async function eatPart(
  id: string,
  left: number,
  now = new Date(),
  store = db,
): Promise<Item | undefined> {
  const item = await store.items.get(id);
  if (!item || item.quantity === null) return undefined;
  if (left <= 0) {
    await resolveItem(id, 'consumido', now, store);
  } else {
    await update(store, id, { quantity: left, price: priceOfRest(item, left) }, now);
  }
  return item;
}
