// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Local inventory (IndexedDB, no account): the same rows as D1 `items`, so they move to the
 * server unchanged when the family creates an account (Phase 3). Nothing here leaves the phone.
 */
import Dexie, { type Table } from 'dexie';
import { lisbonDate } from '../../domain/dates';
import { openItem } from '../../domain/shelf-life';
import { restockSuggestion, type ShoppingEntry } from '../../domain/shopping';
import type { ExpirySource, IsoDate, Item, Location } from '../../domain/types';

/** Household id of the account-less inventory. */
export const LOCAL_HOUSEHOLD = 'local';

/** An item changed here and not yet confirmed by the server (sync.ts). */
export interface PendingChange {
  id: string;
  /** Which table: items (absent, as before) or the shopping list. */
  kind?: 'shopping';
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

export interface NewItem {
  name: string;
  category: string | null;
  location: Location;
  expires_at: IsoDate | null;
  expiry_source: ExpirySource | null;
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

/** Undo of a resolve, from the snackbar. */
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

/** "Editar data": the user's own date always wins. */
export async function setExpiry(
  id: string,
  expiresAt: IsoDate,
  now = new Date(),
  store = db,
): Promise<void> {
  await update(store, id, { expires_at: expiresAt, expiry_source: 'manual' }, now);
}

export async function activeItems(store = db): Promise<Item[]> {
  return store.items.where('status').equals('ativo').toArray();
}
