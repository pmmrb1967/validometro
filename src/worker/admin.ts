// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The admin panel (only for ADMIN_EMAILS; anyone else gets 404). Nothing about what people
 * keep in their fridge: only how much the app uses of the free plan, and how many use it.
 *
 *   GET  /admin/overview → today's values with the limits, 14 days of history, AI use by
 *                          provider (7 days), the latest warnings, and whether they reach a phone
 *   POST /admin/monitor  → runs the hourly watch now (records and warns as the Cron does)
 */
import { Hono } from 'hono';
import { addDays } from '../domain/dates';
import { METRIC_IDS, METRICS, utcDate } from './limits';
import { collectUsage, runMonitor } from './monitor';
import { adminEmails, requireAdmin, type AppEnv } from './session';

export const admin = new Hono<AppEnv>();

admin.use('/admin/*', requireAdmin);

export const HISTORY_DAYS = 14;
export const AI_DAYS = 7;

admin.get('/admin/overview', async (c) => {
  const now = new Date();
  const today = utcDate(now);
  const db = c.env.DB;
  const emails = adminEmails(c.env);
  const [{ values, analyticsError }, history, ai, alerts, phones] = await Promise.all([
    collectUsage(c.env, now),
    db
      .prepare('SELECT date, metric, value FROM usage_daily WHERE date >= ? ORDER BY date')
      .bind(addDays(today, -(HISTORY_DAYS - 1)))
      .all<{ date: string; metric: string; value: number }>(),
    db
      .prepare(
        `SELECT provider, operation, COUNT(*) AS calls, SUM(1 - ok) AS failures,
                COALESCE(SUM(units), 0) AS units
         FROM ai_usage WHERE date >= ? GROUP BY provider, operation
         ORDER BY provider, calls DESC`,
      )
      .bind(addDays(today, -(AI_DAYS - 1)))
      .all<{
        provider: string;
        operation: string;
        calls: number;
        failures: number;
        units: number;
      }>(),
    db
      .prepare(
        'SELECT date, metric, threshold, value, sent_at FROM limit_alerts ORDER BY sent_at DESC, threshold DESC LIMIT 20',
      )
      .all<{ date: string; metric: string; threshold: number; value: number; sent_at: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM push_subscriptions p JOIN users u ON u.id = p.user_id
         WHERE u.email IN (${emails.map(() => '?').join(', ')})`,
      )
      .bind(...emails)
      .first<{ n: number }>(),
  ]);
  return c.json({
    date: today,
    analytics: Boolean(c.env.CF_ANALYTICS_TOKEN),
    analyticsError: analyticsError ?? null,
    metrics: METRIC_IDS.map((id) => ({ id, ...METRICS[id], value: values[id] ?? null })),
    history: history.results,
    ai: ai.results,
    alerts: alerts.results,
    adminPhones: phones?.n ?? 0,
  });
});

admin.post('/admin/monitor', async (c) => {
  const result = await runMonitor(c.env);
  return c.json({ alerts: result.alerts, pushed: result.pushed });
});
