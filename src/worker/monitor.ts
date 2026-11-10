// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The free-plan watch, every hour (the Cron in index.ts). Adapted from Prazómetro
 * (workers/monitor/src/monitor.ts): it reads today's use, keeps one value per metric and UTC
 * day (`usage_daily`), and records a warning at 70% and 90% of a limit, at most one per metric,
 * threshold and day (`limit_alerts`). New warnings go to the administrators' phones by Web
 * Push, with the notification they already get for the daily alert.
 *
 * Without CF_ANALYTICS_TOKEN only what D1 knows is followed (its size, the AI use, the
 * accounts); the Worker requests and the D1 rows read and written need the token.
 */
import { addDays, lisbonDate } from '../domain/dates';
import { forget, pushDeps, target, vapidKeys, type SubscriptionRow } from './alerts';
import { readAnalytics } from './analytics';
import { formatValue, METRICS, percentOf, THRESHOLDS, utcDate, type Metric } from './limits';
import { adminEmails } from './session';
import { sendPush } from './webpush';

/** The analytics could not be read: a warning of its own, once a day. */
export const MONITOR_METRIC = 'monitor';

export interface LimitAlert {
  metric: Metric | typeof MONITOR_METRIC;
  threshold: number;
  value: number;
}

export interface MonitorResult {
  date: string;
  values: Partial<Record<Metric, number>>;
  alerts: LimitAlert[];
  pushed: number;
  analyticsError?: string;
}

/** The same account and database as wrangler.toml (the GraphQL API filters by them). */
export const ACCOUNT_ID = '3c37a84e831f214acafff4873b338bba';
export const DATABASE_ID = '0916b1e9-1569-42f6-b23f-73f22422be6e';

export const monitorDeps: { analyticsFetcher?: typeof fetch } = {};

const count = (result: D1Result | undefined) =>
  (result?.results[0] as { n: number } | undefined)?.n ?? 0;

/** Today's values: from D1 always, from the analytics API when there is a token. */
export async function collectUsage(
  env: Env,
  now: Date,
): Promise<{ values: Partial<Record<Metric, number>>; analyticsError?: string }> {
  const date = utcDate(now);
  const values: Partial<Record<Metric, number>> = {};
  let analyticsError: string | undefined;
  if (env.CF_ANALYTICS_TOKEN) {
    try {
      Object.assign(
        values,
        await readAnalytics(
          { token: env.CF_ANALYTICS_TOKEN, accountId: ACCOUNT_ID, databaseId: DATABASE_ID, date },
          monitorDeps.analyticsFetcher,
        ),
      );
    } catch (err) {
      analyticsError = err instanceof Error ? err.message : 'error';
    }
  }
  const db = env.DB;
  const weekAgo = addDays(lisbonDate(now), -6);
  const [ai, users, households, active] = await db.batch([
    db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN provider = 'workers-ai' THEN units ELSE 0 END), 0) AS n,
                COUNT(*) AS calls
         FROM ai_usage WHERE date = ?`,
      )
      .bind(date),
    db.prepare('SELECT COUNT(*) AS n FROM users'),
    db.prepare('SELECT COUNT(*) AS n FROM households'),
    db.prepare('SELECT COUNT(*) AS n FROM users WHERE last_seen_on >= ?').bind(weekAgo),
  ]);
  // Without the analytics, the size comes from D1 itself (meta.size_after).
  values.d1_size ??= ai?.meta.size_after ?? 0;
  values.ai_neurons = count(ai);
  values.ai_calls = (ai?.results[0] as { calls: number } | undefined)?.calls ?? 0;
  values.users = count(users);
  values.households = count(households);
  values.active_users = count(active);
  return { values, analyticsError };
}

export function alertText(alert: LimitAlert): { title: string; body: string } {
  if (alert.metric === MONITOR_METRIC) {
    return {
      title: 'Painel: estatísticas indisponíveis',
      body: 'Não foi possível ler as estatísticas da Cloudflare. Confirma o token CF_ANALYTICS_TOKEN.',
    };
  }
  const info = METRICS[alert.metric];
  const period = info.daily ? 'de hoje' : 'do plano gratuito';
  return {
    title: `${info.label}: ${alert.threshold}% do limite`,
    body: `${formatValue(alert.metric, alert.value)} de ${formatValue(alert.metric, info.limit ?? 0)} ${period}.`,
  };
}

async function pushToAdmins(env: Env, alerts: LimitAlert[], now: Date): Promise<number> {
  const vapid = vapidKeys(env);
  const emails = adminEmails(env);
  if (!vapid || !emails.length || !alerts.length) return 0;
  const { results } = await env.DB.prepare(
    `SELECT p.* FROM push_subscriptions p JOIN users u ON u.id = p.user_id
     WHERE u.email IN (${emails.map(() => '?').join(', ')})`,
  )
    .bind(...emails)
    .all<SubscriptionRow>();
  // The highest warning only: one notification per run is enough to open the panel.
  const top = [...alerts].sort((a, b) => b.threshold - a.threshold)[0]!;
  const others = alerts.length - 1;
  const text = alertText(top);
  const message = {
    title: text.title,
    body: others ? `${text.body} E mais ${others} no painel.` : text.body,
    tag: 'limites',
    url: '/admin',
  };
  let sent = 0;
  for (const row of results) {
    const result = await sendPush(
      target(row),
      message,
      vapid,
      Math.floor(now.getTime() / 1000),
      pushDeps.fetcher,
    );
    if (result === 'gone') await forget(env.DB, row.endpoint);
    if (result === 'sent') sent++;
  }
  return sent;
}

export async function runMonitor(env: Env, now = new Date()): Promise<MonitorResult> {
  const date = utcDate(now);
  const seconds = Math.floor(now.getTime() / 1000);
  const { values, analyticsError } = await collectUsage(env, now);
  const entries = Object.entries(values) as [Metric, number][];

  const candidates: LimitAlert[] = [];
  for (const [metric, value] of entries) {
    const percent = percentOf(metric, value);
    if (percent === null) continue;
    for (const threshold of THRESHOLDS) {
      if (percent >= threshold) candidates.push({ metric, threshold, value });
    }
  }
  if (analyticsError) candidates.push({ metric: MONITOR_METRIC, threshold: 0, value: 0 });

  const db = env.DB;
  const statements = entries.map(([metric, value]) =>
    db
      .prepare(
        `INSERT INTO usage_daily (date, metric, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (date, metric) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(date, metric, Math.round(value), seconds),
  );
  const alertStart = statements.length;
  for (const alert of candidates) {
    statements.push(
      db
        .prepare(
          `INSERT INTO limit_alerts (date, metric, threshold, value, sent_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT DO NOTHING`,
        )
        .bind(date, alert.metric, alert.threshold, Math.round(alert.value), seconds),
    );
  }
  const results = statements.length ? await db.batch(statements) : [];
  // The primary key of limit_alerts lets each warning through once a day.
  const alerts = candidates.filter((_, i) => results[alertStart + i]?.meta.changes === 1);
  const pushed = await pushToAdmins(env, alerts, now);
  return { date, values, alerts, pushed, analyticsError };
}
