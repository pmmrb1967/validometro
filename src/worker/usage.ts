// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * AI usage, one row per call (`ai_usage`). On Workers AI the units are estimated Neurons: the
 * free allocation is per account and per UTC day, so reading stops a little before the end
 * and the user is pointed to their own key or to typing.
 */
import type { Operation, ProviderId } from '../ai/types';

export const FREE_NEURONS_PER_DAY = 10_000;
/** Left aside for the end of the day: one more receipt should not fail halfway. */
export const NEURON_RESERVE = 1_000;

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export async function recordUsage(
  db: D1Database,
  provider: ProviderId,
  operation: Operation,
  units: number,
  ok: boolean,
  now = new Date(),
): Promise<void> {
  await db
    .prepare('INSERT INTO ai_usage (date, provider, operation, units, ok) VALUES (?, ?, ?, ?, ?)')
    .bind(utcDay(now), provider, operation, Math.max(0, Math.round(units)), ok ? 1 : 0)
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
