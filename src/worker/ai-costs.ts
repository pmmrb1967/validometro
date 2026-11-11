// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * How much an AI reading usually spends, for the note beside each AI button, and what each
 * person spent with their own key. Counts only: never the text, the photo or the key.
 *
 *   GET /ai/estimate → today's Workers AI Neurons (the account's free day) and the average
 *                      call of the last 30 days, by provider, model and operation
 *   GET /ai/my-usage → signed in: their own calls of the last 30 days, by provider and model
 */
import { Hono } from 'hono';
import { addDays } from '../domain/dates';
import { FREE_NEURONS_PER_DAY } from '../domain/ai-cost';
import { requireUser, type AppEnv } from './session';
import { neuronsToday, utcDay } from './usage';

export const aiCosts = new Hono<AppEnv>();

export const ESTIMATE_DAYS = 30;

export interface Estimate {
  neuronsToday: number;
  neuronsLimit: number;
  /** Workers AI: average Neurons per call, by operation. */
  neurons: { operation: string; neurons: number }[];
  /** Own keys: average tokens per call, by model and operation. */
  tokens: { model: string; operation: string; input: number; output: number }[];
}

aiCosts.get('/ai/estimate', async (c) => {
  const db = c.env.DB;
  const now = new Date();
  const since = addDays(utcDay(now), -(ESTIMATE_DAYS - 1));
  const [today, neurons, tokens] = await Promise.all([
    neuronsToday(db, now),
    db
      .prepare(
        `SELECT operation, ROUND(AVG(units)) AS neurons FROM ai_usage
         WHERE date >= ? AND provider = 'workers-ai' AND ok = 1 AND units > 0
         GROUP BY operation`,
      )
      .bind(since)
      .all<{ operation: string; neurons: number }>(),
    db
      .prepare(
        `SELECT model, operation, ROUND(AVG(input_tokens)) AS input,
                ROUND(AVG(output_tokens)) AS output
         FROM ai_usage
         WHERE date >= ? AND provider != 'workers-ai' AND ok = 1 AND input_tokens IS NOT NULL
         GROUP BY model, operation`,
      )
      .bind(since)
      .all<{ model: string; operation: string; input: number; output: number }>(),
  ]);
  c.header('cache-control', 'private, max-age=60');
  return c.json({
    neuronsToday: today,
    neuronsLimit: FREE_NEURONS_PER_DAY,
    neurons: neurons.results,
    tokens: tokens.results,
  } satisfies Estimate);
});

export interface MyUsageRow {
  provider: string;
  model: string | null;
  calls: number;
  input: number;
  output: number;
  /** Calls from before the tokens were kept apart: counted, not priced. */
  unpriced: number;
}

aiCosts.get('/ai/my-usage', requireUser, async (c) => {
  const user = c.get('user')!;
  const since = addDays(utcDay(new Date()), -(ESTIMATE_DAYS - 1));
  const rows = await c.env.DB.prepare(
    `SELECT provider, model, COUNT(*) AS calls,
            COALESCE(SUM(input_tokens), 0) AS input, COALESCE(SUM(output_tokens), 0) AS output,
            SUM(CASE WHEN input_tokens IS NULL THEN 1 ELSE 0 END) AS unpriced
     FROM ai_usage WHERE user_id = ? AND date >= ?
     GROUP BY provider, model ORDER BY calls DESC`,
  )
    .bind(user.id, since)
    .all<MyUsageRow>();
  return c.json({ days: ESTIMATE_DAYS, rows: rows.results });
});
