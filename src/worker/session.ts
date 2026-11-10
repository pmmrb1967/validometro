// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Wattómetro (server/src/routes/context.ts).
/** The signed-in user (if any) for every request, and the checks writes go through. */
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { lisbonDate } from '../domain/dates';
import {
  normalizeEmail,
  readSession,
  SESSION_COOKIE,
  SESSION_SECONDS,
  signSession,
  type User,
} from './auth';

export type AppEnv = { Bindings: Env; Variables: { user: User | null } };

export const COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'Strict',
  prefix: 'host',
} as const;

export const nowSeconds = () => Math.floor(Date.now() / 1000);

export function sessionSecret(c: Context<AppEnv>): string {
  const secret = c.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return secret;
}

/** Writes must come from the app itself: with SameSite=Strict, a second guard against CSRF. */
export function trustedOrigin(c: Context<AppEnv>): boolean {
  const origin = c.req.header('Origin');
  return origin !== undefined && origin === new URL(c.req.url).origin;
}

export async function startSession(c: Context<AppEnv>, user: User): Promise<void> {
  const token = await signSession(user, sessionSecret(c), nowSeconds());
  setCookie(c, SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: SESSION_SECONDS });
}

/** Reads the cookie, when there is one; routes decide whether a user is required. */
export const withUser = createMiddleware<AppEnv>(async (c, next) => {
  c.set('user', null);
  const token = getCookie(c, SESSION_COOKIE, 'host');
  if (token && c.env.SESSION_SECRET) {
    const session = await readSession(c.env.DB, token, c.env.SESSION_SECRET, nowSeconds());
    if (session) {
      if (session.renew) await startSession(c, session.user);
      c.set('user', session.user);
    }
  }
  await next();
});

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && !trustedOrigin(c)) {
    return c.json({ error: 'Pedido recusado.' }, 403);
  }
  if (!c.get('user')) return c.json({ error: 'Sessão terminada. Entra outra vez.' }, 401);
  await next();
});

/** The administrators (secret ADMIN_EMAILS, comma-separated). */
export function adminEmails(env: Env): string[] {
  return (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);
}

export const isAdmin = (env: Env, user: User) => adminEmails(env).includes(user.email);

/** As requireUser, and only for the administrators (the panel, /admin). */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && !trustedOrigin(c)) {
    return c.json({ error: 'Pedido recusado.' }, 403);
  }
  const user = c.get('user');
  if (!user) return c.json({ error: 'Sessão terminada. Entra outra vez.' }, 401);
  if (!isAdmin(c.env, user)) return c.json({ error: 'Não encontrado.' }, 404);
  await next();
});

/**
 * The Lisbon day the user last opened the app, for the panel's "active" count: one write per
 * user and day at most (the WHERE skips it after the first).
 */
export async function markSeen(db: D1Database, user: User, now = new Date()): Promise<void> {
  const today = lisbonDate(now);
  await db
    .prepare(
      'UPDATE users SET last_seen_on = ? WHERE id = ? AND (last_seen_on IS NULL OR last_seen_on <> ?)',
    )
    .bind(today, user.id, today)
    .run();
}

/** The user, after requireUser. */
export function userOf(c: Context<AppEnv>): User {
  const user = c.get('user');
  if (!user) throw new Error('requireUser missing');
  return user;
}
