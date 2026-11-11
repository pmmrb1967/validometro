// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * AI usage, one row per call (`ai_usage`). On Workers AI the units are estimated Neurons: the
 * free allocation is per account and per UTC day, so reading stops a little before the end
 * and the user is pointed to their own key or to typing.
 */
import type { AiUsage, Operation, ProviderId } from '../ai/types';
import { FREE_NEURONS_PER_DAY } from '../domain/ai-cost';

export { FREE_NEURONS_PER_DAY };
/** Left aside for the end of the day: one more receipt should not fail halfway. */
export const NEURON_RESERVE = 1_000;

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export async function recordUsage(
  db: D1Database,
  provider: ProviderId,
  operation: Operation,
  usage: AiUsage | number,
  ok: boolean,
  userId: string | null = null,
  now = new Date(),
): Promise<void> {
  const call = typeof usage === 'number' ? { units: usage } : usage;
  const count = (value: number | undefined) =>
    value === undefined ? null : Math.max(0, Math.round(value));
  await db
    .prepare(
      `INSERT INTO ai_usage (date, user_id, provider, operation, units, ok, model, input_tokens, output_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      utcDay(now),
      userId,
      provider,
      operation,
      count(call.units) ?? 0,
      ok ? 1 : 0,
      call.model ?? null,
      count(call.inputTokens),
      count(call.outputTokens),
    )
    .run();
}

export async function neuronsToday(db: D1Database, now = new Date()): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COALESCE(SUM(units), 0) AS used FROM ai_usage WHERE date = ? AND provider = 'workers-ai'",
    )
    .bind(utcDay(now))
    .first<{ used: number }>();
  return row?.used ?? 0;
}

export async function freeQuotaLeft(db: D1Database, now = new Date()): Promise<boolean> {
  return (await neuronsToday(db, now)) < FREE_NEURONS_PER_DAY - NEURON_RESERVE;
}
