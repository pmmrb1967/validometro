// SPDX-License-Identifier: AGPL-3.0-or-later
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { toBase64Url } from '../src/worker/base64url';
import { buildAlert, pushDeps, sendDailyAlerts } from '../src/worker/alerts';
import { Browser, newItem, signUp } from './helpers';

interface Pulled {
  items: { id: string; name: string; status: string; updated_at: string }[];
  cursor: number;
  more: boolean;
}

describe('sync', () => {
  let phone: Browser;
  let other: Browser;

  beforeAll(async () => {
    phone = await signUp('sync@example.pt');
    other = await signUp('outra-casa@example.pt');
  });

  it('needs an account', async () => {
    expect(
      (await new Browser().request('POST', '/api/sync', { changes: [], cursor: 0 })).status,
    ).toBe(401);
  });

  it('stores changes and gives back only what came after the cursor', async () => {
    const first = await phone.json<Pulled>('POST', '/api/sync', {
      changes: [newItem('Leite')],
      cursor: 0,
    });
    expect(first.items.map((i) => i.name)).toEqual(['Leite']);
    const again = await phone.json<Pulled>('POST', '/api/sync', {
      changes: [],
      cursor: first.cursor,
    });
    expect(again.items).toHaveLength(0);
    const next = await phone.json<Pulled>('POST', '/api/sync', {
      changes: [newItem('Pão')],
      cursor: first.cursor,
    });
    expect(next.items.map((i) => i.name)).toEqual(['Pão']);
    expect(next.cursor).toBeGreaterThan(first.cursor);
  });

  it('keeps the kind of date and the price, and takes items without them', async () => {
    const priced = { ...newItem('Iogurtes'), expiry_kind: 'consumir_de_preferencia', price: 1.29 };
    const pulled = await phone.json<Pulled>('POST', '/api/sync', {
      changes: [priced, newItem('Sem preço')],
      cursor: 0,
    });
    const byName = new Map(pulled.items.map((i) => [i.name, i]));
    expect(byName.get('Iogurtes')).toMatchObject({
      expiry_kind: 'consumir_de_preferencia',
      price: 1.29,
    });
    expect(byName.get('Sem preço')).toMatchObject({ expiry_kind: null, price: null });
  });

  it('keeps the latest change of an item (last write wins)', async () => {
    const item = newItem('Fiambre', { updated_at: '2026-11-09T10:00:00.000Z' });
    await phone.request('POST', '/api/sync', { changes: [item], cursor: 0 });
    const older = { ...item, status: 'deitado_fora', updated_at: '2026-11-09T09:00:00.000Z' };
    const newer = { ...item, status: 'consumido', updated_at: '2026-11-09T11:00:00.000Z' };
    await phone.request('POST', '/api/sync', { changes: [older], cursor: 0 });
    let all = await phone.json<Pulled>('POST', '/api/sync', { changes: [], cursor: 0 });
    expect(all.items.find((i) => i.id === item.id)?.status).toBe('ativo');
    await phone.request('POST', '/api/sync', { changes: [newer], cursor: 0 });
    all = await phone.json<Pulled>('POST', '/api/sync', { changes: [], cursor: 0 });
    expect(all.items.find((i) => i.id === item.id)?.status).toBe('consumido');
  });

  it('never writes over another household’s item', async () => {
    const item = newItem('Queijo');
    await phone.request('POST', '/api/sync', { changes: [item], cursor: 0 });
    await other.request('POST', '/api/sync', {
      changes: [{ ...item, name: 'Roubado', updated_at: '2099-01-01T00:00:00.000Z' }],
      cursor: 0,
    });
    const mine = await phone.json<Pulled>('POST', '/api/sync', { changes: [], cursor: 0 });
    expect(mine.items.find((i) => i.id === item.id)?.name).toBe('Queijo');
    const theirs = await other.json<Pulled>('POST', '/api/sync', { changes: [], cursor: 0 });
    expect(theirs.items.find((i) => i.id === item.id)).toBeUndefined();
  });

  it('shares saved recipes with the household, lists and all, never with another', async () => {
    const at = new Date().toISOString();
    const recipe = {
      id: crypto.randomUUID(),
      title: 'Frango grelhado',
      minutes: 20,
      usa: ['frango'],
      falta: ['limão'],
      steps: ['Temperar.', 'Grelhar.'],
      item_ids: [crypto.randomUUID()],
      starred: true,
      state: 'nova',
      created_at: at,
      updated_at: at,
    };
    const sent = await phone.json<{ recipes: unknown[] }>('POST', '/api/sync', {
      changes: [],
      recipes: [recipe, { ...recipe, id: 'not-a-uuid' }],
      cursor: 0,
    });
    expect(sent.recipes).toContainEqual(expect.objectContaining({ ...recipe }));
    expect(sent.recipes).toHaveLength(1);
    // A later "Fiz esta" wins; another household never sees it.
    const later = new Date(Date.now() + 1000).toISOString();
    const made = await phone.json<{ recipes: { state: string }[] }>('POST', '/api/sync', {
      changes: [],
      recipes: [{ ...recipe, state: 'feita', updated_at: later }],
      cursor: 0,
    });
    expect(made.recipes).toEqual([expect.objectContaining({ id: recipe.id, state: 'feita' })]);
    const theirs = await other.json<{ recipes: unknown[] }>('POST', '/api/sync', {
      changes: [],
      cursor: 0,
    });
    expect(theirs.recipes).toEqual([]);
  });

  it('shares the notes of the receipts saved, hashes only, never with another household', async () => {
    const at = new Date().toISOString();
    const receipt = {
      id: crypto.randomUUID(),
      qr_hash: 'a'.repeat(64),
      store: 'Continente',
      date: '2026-11-11',
      lines: ['0a1b2c3d', '11223344'],
      items: 2,
      total: 12.92,
      created_at: at,
      updated_at: at,
    };
    const sent = await phone.json<{ receipts: unknown[] }>('POST', '/api/sync', {
      changes: [],
      // A line that is not a short hash (the receipt's text) is refused.
      receipts: [receipt, { ...receipt, id: crypto.randomUUID(), lines: ['IOG NAT 4X'] }],
      cursor: 0,
    });
    expect(sent.receipts).toEqual([expect.objectContaining(receipt)]);
    const theirs = await other.json<{ receipts: unknown[] }>('POST', '/api/sync', {
      changes: [],
      cursor: 0,
    });
    expect(theirs.receipts).toEqual([]);
  });

  it('marks an item from the notification, once', async () => {
    const item = newItem('Frango');
    await phone.request('POST', '/api/sync', { changes: [item], cursor: 0 });
    expect(
      (await phone.request('POST', `/api/items/${item.id}/status`, { status: 'consumido' })).status,
    ).toBe(204);
    expect(
      (await phone.request('POST', `/api/items/${item.id}/status`, { status: 'consumido' })).status,
    ).toBe(404);
    expect(
      (await other.request('POST', `/api/items/${item.id}/status`, { status: 'consumido' })).status,
    ).toBe(404);
  });
});

describe('daily alert', () => {
  it('lists the items in order, each with what comes next', () => {
    const alert = buildAlert(
      [
        { id: 'a', name: 'Frango', expires_at: '2026-11-08' },
        { id: 'b', name: 'Iogurtes', expires_at: '2026-11-09' },
        { id: 'c', name: 'Leite', expires_at: '2026-11-12' },
        { id: 'd', name: 'Alface', expires_at: '2026-11-13' },
      ],
      '2026-11-09',
    );
    expect(alert?.items[0]).toEqual({
      id: 'a',
      title: 'Frango: expirou ontem',
      body: 'A seguir: Iogurtes, Leite e mais 1.',
    });
    expect(alert?.items[1]?.title).toBe('Iogurtes: expira hoje');
    expect(alert?.items[3]?.body).toBe('É o último por hoje.');
    expect(buildAlert([], '2026-11-09')).toBeNull();
  });

  it('does not sound the alarm past a "de preferência" date', () => {
    const alert = buildAlert(
      [{ id: 'a', name: 'Iogurtes', expires_at: '2026-11-07', category: 'iogurtes' }],
      '2026-11-09',
    );
    expect(alert?.items[0]).toEqual({
      id: 'a',
      title: 'Iogurtes: passou da data de preferência',
      body: 'Olha, cheira, prova: costuma estar bom. É o último por hoje.',
    });
  });

  it('sends one alert per household at 09:00 in Lisbon, and only once', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
    ])) as CryptoKeyPair;
    const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
    const raw = new Uint8Array(
      (await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer,
    );
    const keys = { ...env, VAPID_PUBLIC_KEY: toBase64Url(raw), VAPID_PRIVATE_KEY: jwk.d! };

    // A device of the household, with real browser-side keys.
    const device = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    const p256dh = toBase64Url(
      new Uint8Array((await crypto.subtle.exportKey('raw', device.publicKey)) as ArrayBuffer),
    );
    const auth = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
    const browser = await signUp('alerta@example.pt');
    const endpoint = 'https://fcm.googleapis.com/fcm/send/abc';
    expect(
      (await browser.request('PUT', '/api/push/subscription', { endpoint, keys: { p256dh, auth } }))
        .status,
    ).toBe(204);
    await browser.request('POST', '/api/sync', {
      changes: [newItem('Natas', { expires_at: '2026-11-10' })],
      cursor: 0,
    });

    const posted: string[] = [];
    pushDeps.fetcher = async (url) => {
      posted.push(url);
      return { status: 201 };
    };
    // 10:00 UTC in November is 10:00 in Lisbon: not the time.
    expect(await sendDailyAlerts(keys, new Date('2026-11-09T10:00:00Z'))).toBe(0);
    expect(await sendDailyAlerts(keys, new Date('2026-11-09T09:00:00Z'))).toBe(1);
    expect(await sendDailyAlerts(keys, new Date('2026-11-09T09:00:00Z'))).toBe(0);
    expect(posted).toEqual([endpoint]);
    pushDeps.fetcher = undefined;
  });
});
