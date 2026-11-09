// SPDX-License-Identifier: AGPL-3.0-or-later
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidGtin } from '../src/domain/barcode';
import { app } from '../src/worker/app';
import { fromOpenFoodFacts, lookupProduct, OFF_USER_AGENT } from '../src/worker/products';

const YOGURT = '5601234567892';

function offAnswer(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => Response.json(body, { status }));
}

const yogurt = {
  status: 1,
  product: {
    product_name_pt: 'Iogurte natural',
    product_name: 'Natural yogurt',
    brands: 'Mimosa, Lactogal',
    categories_tags: ['en:dairies', 'en:fermented-milk-products', 'en:yogurts'],
  },
};

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM products').run();
});

describe('barcodes', () => {
  it('checks the GTIN check digit', () => {
    expect(isValidGtin(YOGURT)).toBe(true);
    expect(isValidGtin('5601234567890')).toBe(false);
    expect(isValidGtin('96385074')).toBe(true); // EAN-8
    expect(isValidGtin('12345')).toBe(false);
    expect(isValidGtin('abc4567890123')).toBe(false);
  });
});

describe('Open Food Facts answer', () => {
  it('prefers the Portuguese name, first brand and our category', () => {
    expect(fromOpenFoodFacts(YOGURT, yogurt)).toEqual({
      ean: YOGURT,
      name: 'Iogurte natural',
      brand: 'Mimosa',
      category: 'iogurtes',
    });
  });

  it('guesses the category from the name when OFF has no useful tags', () => {
    const answer = {
      status: 1,
      product: { product_name: 'Fiambre da perna', categories_tags: [] },
    };
    expect(fromOpenFoodFacts(YOGURT, answer).category).toBe('charcutaria_fatiada');
  });

  it('has no name for an unknown product', () => {
    expect(fromOpenFoodFacts(YOGURT, { status: 0 })).toMatchObject({ name: null, category: null });
  });
});

describe('lookupProduct', () => {
  const now = new Date('2026-11-09T12:00:00Z');

  it('asks OFF once, identifying the app, then answers from D1', async () => {
    const fetcher = offAnswer(yogurt);
    const first = await lookupProduct(env.DB, YOGURT, fetcher, now);
    const second = await lookupProduct(env.DB, YOGURT, fetcher, now);
    expect(first).toEqual({
      ean: YOGURT,
      found: true,
      name: 'Iogurte natural',
      brand: 'Mimosa',
      category: 'iogurtes',
    });
    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const init = fetcher.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('User-Agent')).toBe(OFF_USER_AGENT);
  });

  it('caches a miss for a week, then asks again', async () => {
    const fetcher = offAnswer({ status: 0, status_verbose: 'product not found' }, 404);
    expect((await lookupProduct(env.DB, YOGURT, fetcher, now)).found).toBe(false);
    await lookupProduct(env.DB, YOGURT, fetcher, new Date('2026-11-15T12:00:00Z'));
    expect(fetcher).toHaveBeenCalledTimes(1);
    await lookupProduct(env.DB, YOGURT, fetcher, new Date('2026-11-17T12:00:00Z'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('serves a stale cached product when OFF is down', async () => {
    await lookupProduct(env.DB, YOGURT, offAnswer(yogurt), now);
    const down = vi.fn<typeof fetch>(async () => new Response('oops', { status: 503 }));
    const later = new Date('2027-06-01T12:00:00Z');
    expect((await lookupProduct(env.DB, YOGURT, down, later)).name).toBe('Iogurte natural');
    expect(down).toHaveBeenCalledTimes(1);
  });

  it('fails when OFF is down and nothing is cached', async () => {
    const down = vi.fn<typeof fetch>(async () => new Response('oops', { status: 503 }));
    await expect(lookupProduct(env.DB, YOGURT, down, now)).rejects.toThrow('503');
  });
});

describe('GET /api/products/:ean', () => {
  it('rejects an invalid barcode', async () => {
    const res = await app.request('/api/products/123', {}, env);
    expect(res.status).toBe(400);
  });

  it('answers a cached product without calling OFF', async () => {
    await env.DB.prepare(
      "INSERT INTO products (ean, name, brand, category, fetched_at) VALUES (?, 'Ovos M', NULL, 'ovos', ?)",
    )
      .bind(YOGURT, new Date().toISOString())
      .run();
    const res = await app.request(`/api/products/${YOGURT}`, {}, env);
    expect(await res.json()).toEqual({
      ean: YOGURT,
      found: true,
      name: 'Ovos M',
      brand: null,
      category: 'ovos',
    });
  });
});
