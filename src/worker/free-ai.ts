// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The free AI (Workers AI) shared fairly. The account's daily Neurons are for everyone
 * (usage.ts stops a little before the end); on top of that, each device, or each account when
 * signed in, gets its share of the day, and each address a few readings a minute, so one
 * person or one script cannot spend everyone's. Adapted from Prazómetro (workers/api/src/ai-free.ts).
 *
 * The device is a random id made by the app (src/app/device.ts). The server keeps only
 * sha256(secret + day + id) in `ai_free_daily`: it changes every day, is not the id, and is
 * deleted the day after. The IP address is used for the per-minute limit only, in memory, by
 * Cloudflare's rate limiting binding: never stored nor logged.
 */
import type { Context } from 'hono';
import { DEVICE_ID, FREE_CALLS_PER_DEVICE, FREE_NEURONS_PER_DEVICE } from '../domain/ai-cost';
import { addDays } from '../domain/dates';
import { AiError } from '../ai/types';
import type { AppEnv } from './session';
import { utcDay } from './usage';

export interface FreeShare {
  date: string;
  subject: string;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Whose share this request spends: the account when signed in, otherwise the device. */
export async function freeShareOf(c: Context<AppEnv>, now = new Date()): Promise<FreeShare | null> {
  const date = utcDay(now);
  const user = c.get('user');
  let who: string;
  if (user) {
    who = `user:${user.id}`;
  } else {
    const device = c.req.header('x-device');
    if (!device || !DEVICE_ID.test(device)) return null;
    who = `device:${device}`;
  }
  return { date, subject: await sha256Hex(`${c.env.SESSION_SECRET ?? ''}:${date}:${who}`) };
}

/** A few readings a minute per address (Cloudflare's binding, counted in memory). */
async function tooFast(c: Context<AppEnv>): Promise<boolean> {
  const ip = c.req.header('cf-connecting-ip');
  // Without the header (tests, `wrangler dev` behind a proxy) or the binding, no limit here.
  // The e2e config (wrangler.e2e.toml) has no binding.
  const limiter = c.env.AI_RATE_LIMIT as RateLimit | undefined;
  if (!ip || !limiter) return false;
  const { success } = await limiter.limit({ key: ip });
  return !success;
}

/**
 * Takes one reading from the share before the AI is asked. One statement, so readings that
 * start together cannot all pass: the call is counted at once, the Neurons when known.
 */
export async function claimFreeReading(c: Context<AppEnv>): Promise<FreeShare> {
  const share = await freeShareOf(c);
  if (!share) throw new AiError('no_device', 'no x-device');
  if (await tooFast(c)) throw new AiError('rate_limited', 'per-address limit');
  const row = await c.env.DB.prepare(
    `INSERT INTO ai_free_daily (date, subject, calls, neurons) VALUES (?, ?, 1, 0)
     ON CONFLICT (date, subject) DO UPDATE SET calls = calls + 1
       WHERE calls < ? AND neurons < ?
     RETURNING calls`,
  )
    .bind(share.date, share.subject, FREE_CALLS_PER_DEVICE, FREE_NEURONS_PER_DEVICE)
    .first<{ calls: number }>();
  if (!row) throw new AiError('device_quota', 'device share spent');
  return share;
}

export async function addFreeNeurons(
  db: D1Database,
  share: FreeShare,
  neurons: number,
): Promise<void> {
  if (neurons <= 0) return;
  await db
    .prepare('UPDATE ai_free_daily SET neurons = neurons + ? WHERE date = ? AND subject = ?')
    .bind(Math.round(neurons), share.date, share.subject)
    .run();
}

/** What is left of this share today, for the note beside each AI button. */
export async function freeShareLeft(
  db: D1Database,
  share: FreeShare,
): Promise<{ neurons: number; limit: number }> {
  const row = await db
    .prepare('SELECT calls, neurons FROM ai_free_daily WHERE date = ? AND subject = ?')
    .bind(share.date, share.subject)
    .first<{ calls: number; neurons: number }>();
  const spent =
    row && row.calls >= FREE_CALLS_PER_DEVICE ? FREE_NEURONS_PER_DEVICE : (row?.neurons ?? 0);
  return { neurons: Math.max(0, FREE_NEURONS_PER_DEVICE - spent), limit: FREE_NEURONS_PER_DEVICE };
}

/** Yesterday's rows stay (a day that just turned); older ones go. Run by the hourly cron. */
export async function purgeFreeShares(db: D1Database, now = new Date()): Promise<void> {
  await db
    .prepare('DELETE FROM ai_free_daily WHERE date < ?')
    .bind(addDays(utcDay(now), -1))
    .run();
}
