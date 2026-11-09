// SPDX-License-Identifier: AGPL-3.0-or-later
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

describe('D1 schema', () => {
  beforeAll(async () => {
    await env.DB.prepare(
      "INSERT INTO households (id, name, invite_code) VALUES ('h1', 'Casa', 'ABC123')",
    ).run();
  });

  it('stores an item without quantity or unit (quantities are optional)', async () => {
    await env.DB.prepare(
      "INSERT INTO items (id, household_id, name, location, expires_at, expiry_source) VALUES ('i1', 'h1', 'Leite', 'frigorifico', '2026-11-12T00:00:00Z', 'estimada')",
    ).run();
    const item = await env.DB.prepare('SELECT * FROM items WHERE id = ?')
      .bind('i1')
      .first<{ quantity: number | null; unit: string | null; status: string }>();
    expect(item).toMatchObject({ quantity: null, unit: null, status: 'ativo' });
  });

  it('rejects an unknown item status', async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO items (id, household_id, name, location, status) VALUES ('i2', 'h1', 'Pão', 'despensa', 'perdido')",
      ).run(),
    ).rejects.toThrow(/CHECK constraint/);
  });

  it('keeps long-life items out of the traffic light (no default days)', async () => {
    const rule = await env.DB.prepare(
      "SELECT days_default FROM shelf_life_rules WHERE category = 'longa_duracao'",
    ).first<{ days_default: number | null }>();
    expect(rule?.days_default).toBeNull();
  });

  it('has an opened rule shorter than the closed one for UHT milk', async () => {
    const { results } = await env.DB.prepare(
      "SELECT state, days_default FROM shelf_life_rules WHERE category = 'leite_uht'",
    ).all<{ state: string; days_default: number }>();
    const days = Object.fromEntries(results.map((r) => [r.state, r.days_default]));
    expect(days.aberto).toBeLessThan(days.fechado ?? 0);
  });
});
