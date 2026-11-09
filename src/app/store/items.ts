// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Local inventory (IndexedDB, no account): the same rows as D1 `items`, so they move to the
 * server unchanged when the family creates an account (Phase 3). Nothing here leaves the phone.
 */
import Dexie, { type Table } from 'dexie';
import { lisbonDate } from '../../domain/dates';
import { openItem } from '../../domain/shelf-life';
import type { ExpirySource, IsoDate, Item, Location } from '../../domain/types';

/** Household id of the account-less inventory. */
export const LOCAL_HOUSEHOLD = 'local';

export class InventoryDb extends Dexie {
  items!: Table<Item, string>;

  constructor(name = 'validometro') {
    super(name);
    this.version(1).stores({
      // Only indexed fields here; the rest of the row is stored as is.
      items: 'id, status, [status+expires_at], location, ean',
    });
  }
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
  };
  await store.items.add(item);
  return item;
}

/** "Comido" / "Deitado fora": the item leaves the traffic light (and feeds stats later). */
export async function resolveItem(
  id: string,
  status: 'consumido' | 'deitado_fora',
  now = new Date(),
  store = db,
): Promise<void> {
  await store.items.update(id, { status, resolved_at: now.toISOString() });
}

/** Undo of a resolve, from the snackbar. */
export async function reactivateItem(id: string, store = db): Promise<void> {
  await store.items.update(id, { status: 'ativo', resolved_at: null });
}

/** "Abri isto": records the opening and brings the expiry forward by the opened rule. */
export async function markOpened(
  id: string,
  now = new Date(),
  store = db,
): Promise<Item | undefined> {
  const item = await store.items.get(id);
  if (!item || item.opened_at) return item;
  const changes = openItem(item, lisbonDate(now), now);
  await store.items.update(id, changes);
  return { ...item, ...changes };
}

/** "Editar data": the user's own date always wins. */
export async function setExpiry(id: string, expiresAt: IsoDate, store = db): Promise<void> {
  await store.items.update(id, { expires_at: expiresAt, expiry_source: 'manual' });
}

export async function activeItems(store = db): Promise<Item[]> {
  return store.items.where('status').equals('ativo').toArray();
}
