// SPDX-License-Identifier: AGPL-3.0-or-later
// The free AI shared fairly (src/worker/free-ai.ts): each device's (or account's) share of
// the day, a few readings a minute per address, and nothing that identifies anyone kept.
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FREE_CALLS_PER_DEVICE,
  FREE_NEURONS_PER_ADDRESS,
  FREE_NEURONS_PER_DEVICE,
} from '../src/domain/ai-cost';
import { app } from '../src/worker/app';
import { purgeFreeShares } from '../src/worker/free-ai';
import { utcDay } from '../src/worker/usage';
import { signUp } from './helpers';

const voice = JSON.stringify({
  lines: [
    {
      name: 'Leite',
      category: null,
      quantity: null,
      unit: null,
      perishable: true,
      expires_at: null,
    },
  ],
});

function fakeAi() {
  const calls: unknown[] = [];
  const ai = {
    async run(_model: string, input: unknown) {
      calls.push(input);
      return {
        choices: [{ message: { content: voice } }],
        usage: { prompt_tokens: 2000, completion_tokens: 600 },
      };
    },
  };
  return { ai: ai as unknown as Ai, calls };
}

function speak(ai: Ai, headers: Record<string, string>) {
  return app.request(
    '/api/ingest/voice',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ text: 'comprei leite' }),
    },
    { ...env, AI: ai },
  );
}

const A = { 'x-device': 'device-aaaaaaaaaaaaaaaa' };
const B = { 'x-device': 'device-bbbbbbbbbbbbbbbb' };

async function shares() {
  return (
    await env.DB.prepare('SELECT date, subject, calls, neurons FROM ai_free_daily').all<{
      date: string;
      subject: string;
      calls: number;
      neurons: number;
    }>()
  ).results;
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM ai_usage'),
    env.DB.prepare('DELETE FROM ai_free_daily'),
  ]);
});

describe('the free AI per device', () => {
  it("counts the call and its Neurons in the device's share, by a daily hash, not the id", async () => {
    const res = await speak(fakeAi().ai, A);
    expect(res.status).toBe(200);
    const [row, ...rest] = await shares();
    expect(rest).toHaveLength(0);
    expect(row).toMatchObject({ date: utcDay(new Date()), calls: 1 });
    expect(row!.neurons).toBeGreaterThan(0);
    expect(row!.subject).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.subject).not.toContain('aaaa');
  });

  it('needs the id of the device (an old copy of the app does not send it)', async () => {
    const { ai, calls } = fakeAi();
    const res = await speak(ai, {});
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'no_device' });
    expect(calls).toHaveLength(0);
    expect(await shares()).toHaveLength(0);
  });

  it('stops one device when its share is spent, and not the others', async () => {
    await speak(fakeAi().ai, A);
    await env.DB.prepare('UPDATE ai_free_daily SET neurons = ?')
      .bind(FREE_NEURONS_PER_DEVICE)
      .run();
    const { ai, calls } = fakeAi();
    const spent = await speak(ai, A);
    expect(spent.status).toBe(429);
    expect(await spent.json()).toMatchObject({ code: 'device_quota' });
    expect(calls).toHaveLength(0);
    expect((await speak(ai, B)).status).toBe(200);
  });

  it('caps the calls too, for readings that start together', async () => {
    await speak(fakeAi().ai, A);
    await env.DB.prepare('UPDATE ai_free_daily SET calls = ?').bind(FREE_CALLS_PER_DEVICE).run();
    expect((await speak(fakeAi().ai, A)).status).toBe(429);
  });

  it('counts by the account when signed in, whatever the device', async () => {
    const ana = await signUp('ana.free@example.pt');
    const cookie = { cookie: ana.cookie };
    await speak(fakeAi().ai, { ...cookie, ...A });
    await speak(fakeAi().ai, { ...cookie, ...B });
    const [row, ...rest] = await shares();
    expect(rest).toHaveLength(0);
    expect(row!.calls).toBe(2);
  });

  it('leaves the own-key providers alone: they spend the user, not the free day', async () => {
    const res = await speak(fakeAi().ai, { 'x-ai-provider': 'gemini' });
    expect(await res.json()).toMatchObject({ code: 'no_key' });
    expect(await shares()).toHaveLength(0);
  });

  it('allows a few readings a minute per address', async () => {
    const ip = { ...A, 'cf-connecting-ip': '203.0.113.7' };
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await speak(fakeAi().ai, ip)).status);
    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    // Another address is not slowed down.
    const other = { ...B, 'cf-connecting-ip': '203.0.113.8' };
    expect((await speak(fakeAi().ai, other)).status).toBe(200);
  });

  it('counts the reading in the address share too, by a daily hash, not the IP', async () => {
    await speak(fakeAi().ai, { ...A, 'cf-connecting-ip': '203.0.113.20' });
    const rows = await shares();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.neurons).toBeGreaterThan(0);
    expect(rows[1]!.neurons).toBe(rows[0]!.neurons);
    for (const row of rows) expect(row.subject).not.toContain('203.0.113');
  });

  it('stops a script that makes a new device id each time, by its address', async () => {
    const ip = { 'cf-connecting-ip': '203.0.113.21' };
    expect((await speak(fakeAi().ai, { ...A, ...ip })).status).toBe(200);
    await env.DB.prepare('UPDATE ai_free_daily SET neurons = ?')
      .bind(FREE_NEURONS_PER_ADDRESS)
      .run();
    const { ai, calls } = fakeAi();
    const fresh = await speak(ai, { 'x-device': 'brand-new-device-0001', ...ip });
    expect(fresh.status).toBe(429);
    expect(await fresh.json()).toMatchObject({ code: 'address_quota' });
    expect(calls).toHaveLength(0);
    // Another network is not stopped.
    const other = { 'x-device': 'brand-new-device-0002', 'cf-connecting-ip': '203.0.113.22' };
    expect((await speak(ai, other)).status).toBe(200);
  });

  it("tells the cost note what is left of this device's share", async () => {
    await speak(fakeAi().ai, A);
    const res = await app.request('/api/ai/estimate', { headers: A }, env);
    const estimate = (await res.json()) as { mine: { neurons: number; limit: number } };
    expect(estimate.mine.limit).toBe(FREE_NEURONS_PER_DEVICE);
    expect(estimate.mine.neurons).toBeLessThan(FREE_NEURONS_PER_DEVICE);
    const none = (await (await app.request('/api/ai/estimate', {}, env)).json()) as {
      mine: unknown;
    };
    expect(none.mine).toBeNull();
  });

  it('keeps only today and yesterday', async () => {
    await env.DB.batch(
      ['2026-11-10', '2026-11-13', '2026-11-14'].map((date) =>
        env.DB.prepare(
          "INSERT INTO ai_free_daily (date, subject, calls, neurons) VALUES (?, 'x', 1, 1)",
        ).bind(date),
      ),
    );
    await purgeFreeShares(env.DB, new Date('2026-11-14T08:00:00Z'));
    expect((await shares()).map((row) => row.date).sort()).toEqual(['2026-11-13', '2026-11-14']);
  });
});
