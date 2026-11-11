// SPDX-License-Identifier: AGPL-3.0-or-later
// The cost notes' data: the average call of the last 30 days, today's Neurons, and each
// person's own use (src/worker/ai-costs.ts).
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { recordUsage } from '../src/worker/usage';
import { Browser, signUp } from './helpers';

interface Estimate {
  neuronsToday: number;
  neuronsLimit: number;
  neurons: { operation: string; neurons: number }[];
  tokens: { model: string; operation: string; input: number; output: number }[];
}

describe('AI cost estimate', () => {
  it('averages the calls that worked, by operation and model, with no account', async () => {
    await recordUsage(env.DB, 'workers-ai', 'receipt', 40, true);
    await recordUsage(env.DB, 'workers-ai', 'receipt', 60, true);
    await recordUsage(env.DB, 'workers-ai', 'receipt', 0, false);
    const claude = { model: 'claude-opus-5-5', inputTokens: 4_000, outputTokens: 2_000 };
    await recordUsage(env.DB, 'anthropic', 'recipes', { units: 6_000, ...claude }, true);
    // From before the tokens were kept apart: not in the averages.
    await recordUsage(env.DB, 'anthropic', 'recipes', 9_999, true);

    const estimate = await new Browser().json<Estimate>('GET', '/api/ai/estimate');
    expect(estimate.neuronsLimit).toBe(10_000);
    expect(estimate.neuronsToday).toBe(100);
    expect(estimate.neurons).toEqual([{ operation: 'receipt', neurons: 50 }]);
    expect(estimate.tokens).toEqual([
      { model: 'claude-opus-5-5', operation: 'recipes', input: 4_000, output: 2_000 },
    ]);
  });

  it('shows each person only their own use, and needs an account', async () => {
    expect((await new Browser().request('GET', '/api/ai/my-usage')).status).toBe(401);
    const ana = await signUp('ana@example.pt');
    const me = await env.DB.prepare("SELECT id FROM users WHERE email = 'ana@example.pt'").first<{
      id: string;
    }>();
    const tokens = { model: 'gemini-3.5-flash-lite', inputTokens: 1_000, outputTokens: 500 };
    await recordUsage(env.DB, 'gemini', 'voice', { units: 1_500, ...tokens }, true, me!.id);
    await recordUsage(env.DB, 'gemini', 'voice', { units: 1_500, ...tokens }, true, null);

    const mine = await ana.json<{ days: number; rows: unknown[] }>('GET', '/api/ai/my-usage');
    expect(mine.days).toBe(30);
    expect(mine.rows).toEqual([
      {
        provider: 'gemini',
        model: 'gemini-3.5-flash-lite',
        calls: 1,
        input: 1_000,
        output: 500,
        unpriced: 0,
      },
    ]);
  });
});
