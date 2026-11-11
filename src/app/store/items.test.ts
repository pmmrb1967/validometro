// SPDX-License-Identifier: AGPL-3.0-or-later
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  activeItems,
  addItem,
  deleteItem,
  InventoryDb,
  LOCAL_HOUSEHOLD,
  markOpened,
  reactivateItem,
  resolveItem,
  setExpiry,
} from './items';

let store: InventoryDb;
const now = new Date('2026-11-09T12:00:00Z');

beforeEach(() => {
  store = new InventoryDb(`test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await store.delete();
});

describe('local inventory', () => {
  it('adds an item without quantity, in the D1 shape', async () => {
    const item = await addItem(
      {
        name: '  Iogurtes ',
        category: 'iogurtes',
        location: 'frigorifico',
        expires_at: '2026-11-30',
        expiry_source: 'impressa',
      },
      now,
      store,
    );
    expect(item).toMatchObject({
      household_id: LOCAL_HOUSEHOLD,
      name: 'Iogurtes',
      quantity: null,
      unit: null,
      opened_at: null,
      status: 'ativo',
      purchased_at: now.toISOString(),
    });
    expect(await store.items.get(item.id)).toEqual(item);
  });

  it('drops the expiry source when there is no date', async () => {
    const item = await addItem(
      {
        name: 'Arroz',
        category: 'longa_duracao',
        location: 'despensa',
        expires_at: null,
        expiry_source: 'estimada',
      },
      now,
      store,
    );
    expect(item.expiry_source).toBeNull();
  });

  it('resolves and undoes, keeping only active items in the list', async () => {
    const milk = await addItem(
      {
        name: 'Leite',
        category: 'leite_uht',
        location: 'despensa',
        expires_at: '2027-01-10',
        expiry_source: 'impressa',
      },
      now,
      store,
    );
    await resolveItem(milk.id, 'consumido', now, store);
    expect(await activeItems(store)).toEqual([]);
    expect(await store.items.get(milk.id)).toMatchObject({
      status: 'consumido',
      resolved_at: now.toISOString(),
    });
    await reactivateItem(milk.id, new Date(), store);
    expect((await activeItems(store)).map((item) => item.id)).toEqual([milk.id]);
  });

  it('"Apagar" (saved by mistake): out, counted nowhere, nothing on the list, undone', async () => {
    const milk = await addItem(
      {
        name: 'Leite pasteurizado',
        category: 'leite_fresco',
        location: 'frigorifico',
        expires_at: '2026-11-14',
        expiry_source: 'estimada',
        price: 1.08,
      },
      now,
      store,
    );
    await deleteItem(milk.id, now, store);
    expect(await activeItems(store)).toEqual([]);
    expect(await store.items.get(milk.id)).toMatchObject({ status: 'apagado' });
    // Not "bebido": no suggestion to buy it again. Queued, so the other phones drop it too.
    expect(await store.shopping.count()).toBe(0);
    expect(await store.outbox.get(milk.id)).toBeDefined();
    const { wasteStats } = await import('../../domain/stats');
    const stats = wasteStats([(await store.items.get(milk.id))!], '2026-11-11');
    expect(stats.months.every((month) => month.eaten === 0 && month.wasted === 0)).toBe(true);
    await reactivateItem(milk.id, new Date(), store);
    expect((await activeItems(store)).map((item) => item.id)).toEqual([milk.id]);
  });

  it('"Abri isto" shortens the expiry once', async () => {
    const milk = await addItem(
      {
        name: 'Leite',
        category: 'leite_uht',
        location: 'frigorifico',
        expires_at: '2027-01-10',
        expiry_source: 'impressa',
      },
      now,
      store,
    );
    const opened = await markOpened(milk.id, now, store);
    expect(opened).toMatchObject({ expires_at: '2026-11-13', expiry_source: 'estimada' });
    // A second tap does not move the date again.
    const again = await markOpened(milk.id, new Date('2026-11-11T12:00:00Z'), store);
    expect(again?.expires_at).toBe('2026-11-13');
  });

  it('a date typed by the user is manual', async () => {
    const bread = await addItem(
      {
        name: 'Pão',
        category: 'pao_fresco',
        location: 'despensa',
        expires_at: '2026-11-11',
        expiry_source: 'estimada',
      },
      now,
      store,
    );
    await setExpiry(bread.id, '2026-11-12', undefined, new Date(), store);
    expect(await store.items.get(bread.id)).toMatchObject({
      expires_at: '2026-11-12',
      expiry_source: 'manual',
    });
  });
});

describe('changes waiting for the server', () => {
  it('queues every change with its time, once per item', async () => {
    const milk = await addItem(
      {
        name: 'Leite',
        category: 'leite_uht',
        location: 'frigorifico',
        expires_at: '2026-11-12',
        expiry_source: 'estimada',
      },
      new Date('2026-11-09T10:00:00Z'),
      store,
    );
    expect(await store.outbox.toArray()).toEqual([
      { id: milk.id, updated_at: '2026-11-09T10:00:00.000Z' },
    ]);
    await resolveItem(milk.id, 'consumido', new Date('2026-11-09T11:00:00Z'), store);
    const queued = await store.outbox.toArray();
    expect(queued.filter((entry) => !entry.kind)).toEqual([
      { id: milk.id, updated_at: '2026-11-09T11:00:00.000Z' },
    ]);
    expect((await store.items.get(milk.id))?.updated_at).toBe('2026-11-09T11:00:00.000Z');
    // Eaten: suggested on the shopping list, and queued too.
    const [suggestion] = await store.shopping.toArray();
    expect(suggestion).toMatchObject({ name: 'Leite', state: 'sugerido', item_id: milk.id });
    expect(queued).toContainEqual(
      expect.objectContaining({ id: suggestion!.id, kind: 'shopping' }),
    );
    // Undo of "Comido": the suggestion goes away.
    await reactivateItem(milk.id, new Date('2026-11-09T11:01:00Z'), store);
    expect((await store.shopping.get(suggestion!.id))?.state).toBe('removido');
  });
});
