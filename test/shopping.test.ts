// SPDX-License-Identifier: AGPL-3.0-or-later
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/worker/app';
import { newItem, signUp, type Browser } from './helpers';

interface Pulled {
  items: { id: string }[];
  shopping: { id: string; name: string; state: string; source: string; item_id: string | null }[];
  cursor: number;
  more: boolean;
}

function entry(name: string, overrides: Record<string, unknown> = {}) {
  const at = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    category: null,
    source: 'manual',
    state: 'pendente',
    item_id: null,
    created_at: at,
    updated_at: at,
    ...overrides,
  };
}

describe('shared shopping list', () => {
  let phone: Browser;

  beforeAll(async () => {
    phone = await signUp('compras@example.pt');
  });

  it('syncs entries with the items, under one cursor', async () => {
    const milk = entry('Leite');
    const first = await phone.json<Pulled>('POST', '/api/sync', {
      changes: [newItem('Pão')],
      shopping: [milk],
      cursor: 0,
    });
    expect(first.shopping.map((e) => e.name)).toEqual(['Leite']);
    expect(first.items).toHaveLength(1);
    const bought = {
      ...milk,
      state: 'comprado',
      updated_at: new Date(Date.now() + 1000).toISOString(),
    };
    const next = await phone.json<Pulled>('POST', '/api/sync', {
      changes: [],
      shopping: [bought],
      cursor: first.cursor,
    });
    expect(next.shopping).toEqual([expect.objectContaining({ id: milk.id, state: 'comprado' })]);
    expect(next.items).toHaveLength(0);
  });

  it('still accepts phones that send no shopping list', async () => {
    const res = await phone.request('POST', '/api/sync', { changes: [], cursor: 0 });
    expect(res.status).toBe(200);
  });

  it('suggests buying again what was eaten from the notification, once', async () => {
    const yogurt = newItem('Iogurtes');
    const other = newItem('Iogurtes');
    await phone.request('POST', '/api/sync', { changes: [yogurt, other], cursor: 0 });
    await phone.request('POST', `/api/items/${yogurt.id}/status`, { status: 'consumido' });
    await phone.request('POST', `/api/items/${other.id}/status`, { status: 'consumido' });
    const all = await phone.json<Pulled>('POST', '/api/sync', { changes: [], cursor: 0 });
    const suggested = all.shopping.filter((e) => e.name === 'Iogurtes');
    expect(suggested).toEqual([
      expect.objectContaining({ source: 'auto', state: 'sugerido', item_id: yogurt.id }),
    ]);
  });

  it('does not suggest what was thrown away', async () => {
    const lettuce = newItem('Alface');
    await phone.request('POST', '/api/sync', { changes: [lettuce], cursor: 0 });
    await phone.request('POST', `/api/items/${lettuce.id}/status`, { status: 'deitado_fora' });
    const all = await phone.json<Pulled>('POST', '/api/sync', { changes: [], cursor: 0 });
    expect(all.shopping.some((e) => e.name === 'Alface')).toBe(false);
  });
});

describe('recipes', () => {
  function fakeAi(answer: unknown) {
    return {
      run: async () => ({
        choices: [{ message: { content: JSON.stringify(answer) } }],
        usage: { prompt_tokens: 300, completion_tokens: 400 },
      }),
    };
  }

  it('returns 2–3 recipes for what is about to go off', async () => {
    const recipes = {
      recipes: [
        {
          title: 'Omelete de espinafres',
          minutes: 15,
          usa: ['Ovos', 'Espinafres'],
          falta: [],
          steps: ['Bate os ovos.', 'Salteia os espinafres.', 'Junta tudo na frigideira.'],
        },
        {
          title: 'Arroz de frango',
          minutes: 35,
          usa: ['Frango'],
          falta: ['Chouriço'],
          steps: ['Aloura o frango.', 'Junta o arroz e a água.'],
        },
      ],
    };
    const res = await app.request(
      '/api/ai/recipes',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-device': 'test-device-shopping-0001' },
        body: JSON.stringify({
          items: [
            { name: 'Ovos', days: 1 },
            { name: 'Frango', days: 0 },
          ],
        }),
      },
      { ...env, AI: fakeAi(recipes) as unknown as Ai },
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as typeof recipes).recipes.map((r) => r.title)).toEqual([
      'Omelete de espinafres',
      'Arroz de frango',
    ]);
    const usage = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM ai_usage WHERE operation = 'recipes' AND ok = 1",
    ).first<{ n: number }>();
    expect(usage?.n).toBe(1);
  });

  it('needs something to cook with', async () => {
    const res = await app.request(
      '/api/ai/recipes',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"items":[]}' },
      env,
    );
    expect(res.status).toBe(400);
  });
});
