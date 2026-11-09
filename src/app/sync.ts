// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Keeps the phone's copy (IndexedDB) and the household's (D1) in step, once there is an
 * account. Changes go into a queue (store/items.ts, outbox) and leave when there is a
 * connection; what others changed comes back after the last number seen (the cursor).
 *
 * - First sign-in on this phone: everything already here goes to the account (Phase 1 data
 *   is not lost).
 * - Another household (joined or left): the copy starts again from the server.
 * - Sign-out: the copy is cleared, so the next person on this phone does not see it.
 */
import type { ShoppingEntry } from '../domain/shopping';
import type { Item } from '../domain/types';
import { accountListeners, currentUser, type Me } from './account';
import { db, localChangeListeners, type InventoryDb } from './store/items';

const MAX_CHANGES = 200;
const SOON_MS = 1500;
const EVERY_MS = 2 * 60_000;

interface SyncResponse {
  items: Item[];
  shopping: ShoppingEntry[];
  cursor: number;
  more: boolean;
}

async function meta<T extends string | number>(
  store: InventoryDb,
  key: string,
): Promise<T | undefined> {
  return (await store.meta.get(key))?.value as T | undefined;
}

async function setMeta(store: InventoryDb, key: string, value: string | number): Promise<void> {
  await store.meta.put({ key, value });
}

/** Everything here, queued for the server (first sign-in on this phone). */
async function queueEverything(store: InventoryDb): Promise<void> {
  await store.transaction('rw', store.items, store.shopping, store.outbox, async () => {
    const items = await store.items.toArray();
    await store.outbox.bulkPut(
      items.map((item) => ({ id: item.id, updated_at: item.updated_at ?? item.created_at })),
    );
    const shopping = await store.shopping.toArray();
    await store.outbox.bulkPut(
      shopping.map((entry) => ({
        id: entry.id,
        updated_at: entry.updated_at,
        kind: 'shopping' as const,
      })),
    );
  });
}

async function clearCopy(store: InventoryDb): Promise<void> {
  await store.transaction('rw', store.items, store.shopping, store.outbox, store.meta, async () => {
    await store.items.clear();
    await store.shopping.clear();
    await store.outbox.clear();
    await store.meta.clear();
  });
}

/** What the server needs: no household or author (it knows them from the session). */
function toChange(item: Item) {
  const change: Partial<Item> = { ...item, updated_at: item.updated_at ?? item.created_at };
  delete change.household_id;
  delete change.created_by;
  return change;
}

function toShoppingChange(entry: ShoppingEntry) {
  const change: Partial<ShoppingEntry> = { ...entry };
  delete change.household_id;
  return change;
}

let running: Promise<void> | null = null;

/** One round: send what is queued, then take what changed; again while there is more. */
async function round(store: InventoryDb, me: Me): Promise<void> {
  const householdId = me.household?.id;
  if (!householdId) return;
  const known = await meta<string>(store, 'household');
  if (known === undefined) {
    await queueEverything(store);
  } else if (known !== householdId) {
    // Another household: what is here belonged to the old one.
    await clearCopy(store);
  }
  await setMeta(store, 'household', householdId);

  for (;;) {
    const pending = await store.outbox.limit(MAX_CHANGES).toArray();
    const itemIds = pending.filter((entry) => entry.kind !== 'shopping').map((entry) => entry.id);
    const shoppingIds = pending
      .filter((entry) => entry.kind === 'shopping')
      .map((entry) => entry.id);
    const items = (await store.items.bulkGet(itemIds)).filter(
      (item): item is Item => item !== undefined,
    );
    const shopping = (await store.shopping.bulkGet(shoppingIds)).filter(
      (entry): entry is ShoppingEntry => entry !== undefined,
    );
    const cursor = (await meta<number>(store, 'cursor')) ?? 0;
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        changes: items.map(toChange),
        shopping: shopping.map(toShoppingChange),
        cursor,
      }),
    });
    if (!res.ok) throw new Error(`sync ${res.status}`);
    const answer = (await res.json()) as SyncResponse;
    const tables = [store.items, store.shopping, store.outbox, store.meta];
    await store.transaction('rw', tables, async () => {
      // Sent and not changed again meanwhile: no longer pending.
      for (const entry of pending) {
        const now = await store.outbox.get(entry.id);
        if (now?.updated_at === entry.updated_at) await store.outbox.delete(entry.id);
      }
      for (const item of answer.items) {
        const queued = await store.outbox.get(item.id);
        // A newer change still waiting here wins over what came back.
        if (queued && queued.updated_at > item.updated_at!) continue;
        await store.items.put(item);
      }
      for (const entry of answer.shopping ?? []) {
        const queued = await store.outbox.get(entry.id);
        if (queued && queued.updated_at > entry.updated_at) continue;
        await store.shopping.put(entry);
      }
      await setMeta(store, 'cursor', answer.cursor);
    });
    if (!answer.more && pending.length < MAX_CHANGES) break;
  }
}

export function syncNow(store = db): Promise<void> {
  const me = currentUser();
  if (!me || !navigator.onLine) return Promise.resolve();
  running ??= round(store, me)
    .catch((err: unknown) => console.warn('Sync failed', err instanceof Error ? err.message : err))
    .finally(() => {
      running = null;
    });
  return running;
}

let timer: number | undefined;

/** A change was made here: send it in a moment (several taps go together). */
export function syncSoon(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void syncNow(), SOON_MS);
}

export function startSync(): void {
  localChangeListeners.add(syncSoon);
  accountListeners.add((me, before) => {
    if (me) void syncNow();
    else if (before) void clearCopy(db);
  });
  window.addEventListener('online', () => void syncNow());
  // An answer given in the notification (public/push-sw.js) changed an item on the server.
  navigator.serviceWorker?.addEventListener('message', (event: MessageEvent<{ type?: string }>) => {
    if (event.data?.type === 'items-changed') void syncNow();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, EVERY_MS);
}
