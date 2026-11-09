// SPDX-License-Identifier: AGPL-3.0-or-later
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app, shelfLifeRuleSchema } from '../src/worker/app';

describe('GET /api/health', () => {
  it('answers ok and counts the seeded shelf-life rules', async () => {
    const res = await app.request('/api/health', {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; db: { shelfLifeRules: number } };
    expect(body.ok).toBe(true);
    expect(body.db.shelfLifeRules).toBeGreaterThan(20);
  });
});

describe('GET /api/shelf-life-rules', () => {
  it('returns valid rules filtered by location', async () => {
    const res = await app.request('/api/shelf-life-rules?location=congelador', {}, env);
    expect(res.status).toBe(200);
    const { rules } = (await res.json()) as { rules: unknown[] };
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(shelfLifeRuleSchema.parse(rule).location).toBe('congelador');
    }
  });

  it('rejects an unknown location', async () => {
    const res = await app.request('/api/shelf-life-rules?location=varanda', {}, env);
    expect(res.status).toBe(400);
  });
});

it('answers unknown API paths with a JSON 404', async () => {
  const res = await app.request('/api/nope', {}, env);
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: 'Não encontrado.' });
});
