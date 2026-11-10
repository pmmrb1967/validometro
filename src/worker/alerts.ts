// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The daily alert, by Web Push (webpush.ts): at 09:00 in Lisbon, one notification per
 * household with what should be used first. It answers with one tap (principle 3): the
 * service worker (public/push-sw.js) marks the item "Comido" or "Deitado fora", or skips it
 * ("Ainda tenho"), and shows the next one, without opening the app.
 *
 *   GET  /push/key → {publicKey}; 503 when the Worker has no VAPID keys
 *   PUT  /push/subscription {endpoint, keys: {p256dh, auth}} → 204
 *   DELETE /push/subscription {endpoint} → 204
 *   POST /push/test {endpoint} → 204 sent; 404 unknown; 502 the push service refused
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { addDays, daysBetween, lisbonDate } from '../domain/dates';
import { pastBestBefore } from '../domain/date-kind';
import { AMBER_MAX_DAYS, daysLabel } from '../domain/traffic-light';
import type { ExpiryKind } from '../domain/types';
import { purgeLoginFailures } from './auth';
import { requireUser, userOf, type AppEnv } from './session';
import { isPushEndpoint, sendPush, type Fetcher, type PushTarget, type VapidKeys } from './webpush';

export const alerts = new Hono<AppEnv>();

/** Shown in the alert, one after the other; more than this is for the app. */
export const MAX_ALERT_ITEMS = 8;
export const ALERT_HOUR = 9;

export function vapidKeys(env: Env): VapidKeys | undefined {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return undefined;
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: 'mailto:validometro@outlook.com',
  };
}

const endpoint = z.string().max(2000).refine(isPushEndpoint);
const SubscriptionBody = z.object({
  endpoint,
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
const EndpointBody = z.object({ endpoint });

export interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  keys_json: string;
}

export function target(row: SubscriptionRow): PushTarget {
  const keys = JSON.parse(row.keys_json) as { p256dh: string; auth: string };
  return { endpoint: row.endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

export async function forget(db: D1Database, endpointUrl: string): Promise<void> {
  await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpointUrl).run();
}

alerts.get('/push/key', requireUser, (c) => {
  const vapid = vapidKeys(c.env);
  return vapid
    ? c.json({ publicKey: vapid.publicKey })
    : c.json({ error: 'Os alertas ainda não estão ligados no servidor.' }, 503);
});

alerts.put('/push/subscription', requireUser, async (c) => {
  const parsed = SubscriptionBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Pedido inválido.' }, 400);
  const { endpoint: url, keys } = parsed.data;
  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, keys_json) VALUES (?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, keys_json = excluded.keys_json`,
  )
    .bind(crypto.randomUUID(), userOf(c).id, url, JSON.stringify(keys))
    .run();
  return c.body(null, 204);
});

alerts.delete('/push/subscription', requireUser, async (c) => {
  const parsed = EndpointBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Pedido inválido.' }, 400);
  await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')
    .bind(parsed.data.endpoint, userOf(c).id)
    .run();
  return c.body(null, 204);
});

/** For tests: what posts to the push services. */
export const pushDeps: { fetcher?: Fetcher } = {};

alerts.post('/push/test', requireUser, async (c) => {
  const vapid = vapidKeys(c.env);
  if (!vapid) return c.json({ error: 'Os alertas ainda não estão ligados no servidor.' }, 503);
  const parsed = EndpointBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Pedido inválido.' }, 400);
  const row = await c.env.DB.prepare(
    'SELECT * FROM push_subscriptions WHERE endpoint = ? AND user_id = ?',
  )
    .bind(parsed.data.endpoint, userOf(c).id)
    .first<SubscriptionRow>();
  if (!row) return c.json({ error: 'Este telemóvel não está registado para alertas.' }, 404);
  const message = {
    title: 'Validómetro',
    body: 'Os alertas estão a funcionar. Recebes um por dia, às 9h, quando houver algo a usar.',
    tag: 'teste',
    url: '/definicoes',
  };
  const result = await sendPush(
    target(row),
    message,
    vapid,
    Math.floor(Date.now() / 1000),
    pushDeps.fetcher,
  );
  if (result === 'gone') await forget(c.env.DB, row.endpoint);
  return result === 'sent'
    ? c.body(null, 204)
    : c.json({ error: 'O serviço de notificações recusou o envio.' }, 502);
});

// --- The daily digest ----------------------------------------------------------------------

export interface AlertItem {
  id: string;
  title: string;
  body: string;
}

export interface ExpiryAlert {
  kind: 'expiry';
  tag: string;
  url: string;
  items: AlertItem[];
}

interface DueRow {
  id: string;
  name: string;
  expires_at: string;
  category?: string | null;
  opened_at?: string | null;
  expiry_kind?: ExpiryKind | null;
}

/** "Iogurtes, leite e mais 2": what comes after the item shown. */
function after(names: string[]): string {
  if (!names.length) return 'É o último por hoje.';
  const shown = names.slice(0, 2);
  const rest = names.length - shown.length;
  const list = rest > 0 ? `${shown.join(', ')} e mais ${rest}` : shown.join(' e ');
  return `A seguir: ${list}.`;
}

/** One entry per item, in order; each carries its own text, so the service worker needs none. */
export function buildAlert(due: DueRow[], today: string): ExpiryAlert | null {
  if (!due.length) return null;
  const items = due.map((row, index) => {
    const days = daysBetween(today, row.expires_at);
    const kind = { category: row.category ?? null, opened_at: row.opened_at ?? null };
    const quality = pastBestBefore({ ...kind, expiry_kind: row.expiry_kind ?? null }, days);
    // Past a "de preferência" date it is a look, not an alarm (date-kind.ts).
    const when = quality ? 'passou da data de preferência' : daysLabel(days).toLowerCase();
    const next = after(due.slice(index + 1).map((other) => other.name));
    return {
      id: row.id,
      title: `${row.name}: ${when}`,
      body: quality ? `Olha, cheira, prova: costuma estar bom. ${next}` : next,
    };
  });
  return { kind: 'expiry', tag: 'validades', url: '/', items };
}

/** Active items that are red or amber, soonest first. */
export async function dueItems(db: D1Database, householdId: string, today: string) {
  const { results } = await db
    .prepare(
      `SELECT id, name, expires_at, category, opened_at, expiry_kind FROM items
       WHERE household_id = ? AND status = 'ativo' AND expires_at IS NOT NULL AND expires_at <= ?
       ORDER BY expires_at, name LIMIT ?`,
    )
    .bind(householdId, addDays(today, AMBER_MAX_DAYS), MAX_ALERT_ITEMS)
    .all<DueRow>();
  return results;
}

export function lisbonHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'Europe/Lisbon',
    }).format(now),
  );
}

/**
 * The Cron runs every hour; only the run that is 09:00 in Lisbon sends (summer and winter
 * time). `alert_log` keeps one per household and day even if it runs again.
 */
export async function sendDailyAlerts(env: Env, now = new Date(), force = false): Promise<number> {
  await purgeLoginFailures(env.DB, Math.floor(now.getTime() / 1000));
  const vapid = vapidKeys(env);
  if (!vapid || (!force && lisbonHour(now) !== ALERT_HOUR)) return 0;
  const today = lisbonDate(now);
  const { results: subscriptions } = await env.DB.prepare(
    `SELECT p.*, m.household_id FROM push_subscriptions p
     JOIN household_members m ON m.user_id = p.user_id ORDER BY m.household_id`,
  ).all<SubscriptionRow & { household_id: string }>();
  const byHousehold = new Map<string, SubscriptionRow[]>();
  for (const row of subscriptions) {
    byHousehold.set(row.household_id, [...(byHousehold.get(row.household_id) ?? []), row]);
  }
  let sent = 0;
  for (const [householdId, rows] of byHousehold) {
    const claimed = await env.DB.prepare(
      'INSERT INTO alert_log (household_id, day) VALUES (?, ?) ON CONFLICT DO NOTHING',
    )
      .bind(householdId, today)
      .run();
    if (!claimed.meta.changes) continue;
    const alert = buildAlert(await dueItems(env.DB, householdId, today), today);
    if (!alert) continue;
    for (const row of rows) {
      const result = await sendPush(
        target(row),
        alert,
        vapid,
        Math.floor(now.getTime() / 1000),
        pushDeps.fetcher,
      );
      if (result === 'gone') await forget(env.DB, row.endpoint);
      if (result === 'sent') sent++;
    }
    await env.DB.prepare('UPDATE alert_log SET sent = ? WHERE household_id = ? AND day = ?')
      .bind(rows.length, householdId, today)
      .run();
  }
  return sent;
}
