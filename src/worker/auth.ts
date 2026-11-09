// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Wattómetro (server/src/auth.ts, server/src/repo/users.ts).
/**
 * Who is calling: email + password (password.ts), then a session in a signed
 * HttpOnly/Secure/SameSite=Strict cookie (HMAC-SHA256 with SESSION_SECRET).
 *
 * The session carries the user's session_version, so raising it (a password change) signs
 * the user out everywhere. Sessions slide: one used a day after it was issued is replaced,
 * so only SESSION_SECONDS without use sign out. Failed logins lock the email from that
 * address, and many lock the address: whoever knows an email cannot lock its owner out.
 */
import { z } from 'zod';
import { fromBase64Url, toBase64Url } from './base64url';
import { DUMMY_HASH, verifyPassword } from './password';

export const SESSION_COOKIE = 'vm_session';
export const SESSION_SECONDS = 90 * 24 * 3600;
export const RENEW_AFTER_SECONDS = 24 * 3600;
export const MAX_LOGIN_FAILURES = 5;
export const MAX_ADDRESS_FAILURES = 20;
export const LOCK_SECONDS = 15 * 60;
export const MIN_SECRET_LENGTH = 32;

export interface User {
  id: string;
  email: string;
  householdId: string;
  sessionVersion: number;
}

const encoder = new TextEncoder();

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const SessionPayload = z.object({ uid: z.string(), ver: z.number().int(), exp: z.number().int() });

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error('SESSION_SECRET missing or too short');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** The caller's address as the login limits keep it: an HMAC, never the address itself. */
export async function addressKey(ip: string | undefined, secret: string): Promise<string> {
  const data = encoder.encode(`login-address:${ip ?? 'unknown'}`);
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), data);
  return toBase64Url(new Uint8Array(signature).slice(0, 16));
}

export async function signSession(user: User, secret: string, now: number): Promise<string> {
  const payload = { uid: user.id, ver: user.sessionVersion, exp: now + SESSION_SECONDS };
  const data = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(data));
  return `${data}.${toBase64Url(new Uint8Array(signature))}`;
}

interface UserRow {
  id: string;
  email: string;
  session_version: number;
  household_id: string | null;
  password_hash: string;
}

const USER_SELECT = `SELECT u.id, u.email, u.session_version, u.password_hash, m.household_id
  FROM users u LEFT JOIN household_members m ON m.user_id = u.id`;

function toUser(row: UserRow): User | null {
  if (!row.household_id) return null;
  return {
    id: row.id,
    email: row.email,
    householdId: row.household_id,
    sessionVersion: row.session_version,
  };
}

export async function getUser(db: D1Database, id: string): Promise<User | null> {
  const row = await db.prepare(`${USER_SELECT} WHERE u.id = ?`).bind(id).first<UserRow>();
  return row ? toUser(row) : null;
}

export async function findUserByEmail(
  db: D1Database,
  email: string,
): Promise<(User & { passwordHash: string }) | null> {
  const row = await db
    .prepare(`${USER_SELECT} WHERE u.email = ?`)
    .bind(normalizeEmail(email))
    .first<UserRow>();
  const user = row && toUser(row);
  return user && row ? { ...user, passwordHash: row.password_hash } : null;
}

export interface Session {
  user: User;
  renew: boolean;
}

/** A valid, unexpired session whose account still exists and was not signed out. */
export async function readSession(
  db: D1Database,
  token: string,
  secret: string,
  now: number,
): Promise<Session | null> {
  const [data, signature, extra] = token.split('.');
  if (!data || !signature || extra !== undefined) return null;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      fromBase64Url(signature),
      encoder.encode(data),
    );
    if (!valid) return null;
    const payload = SessionPayload.parse(JSON.parse(new TextDecoder().decode(fromBase64Url(data))));
    if (payload.exp <= now) return null;
    const user = await getUser(db, payload.uid);
    if (!user || user.sessionVersion !== payload.ver) return null;
    return { user, renew: payload.exp - now < SESSION_SECONDS - RENEW_AFTER_SECONDS };
  } catch {
    return null;
  }
}

/** Seconds until this email may try again from this address, or 0. */
export async function lockedFor(
  db: D1Database,
  email: string,
  address: string,
  now: number,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT MAX(until) AS until FROM (
         SELECT locked_until AS until FROM login_attempts WHERE email = ?1 AND address = ?2
         UNION ALL
         SELECT locked_until FROM login_addresses WHERE address = ?2
       )`,
    )
    .bind(normalizeEmail(email), address)
    .first<{ until: number | null }>();
  return row?.until && row.until > now ? row.until - now : 0;
}

/** Forgets failures LOCK_SECONDS after the last one, once no lock is on. */
export async function purgeLoginFailures(db: D1Database, now: number): Promise<void> {
  await db.batch(
    ['login_attempts', 'login_addresses'].map((table) =>
      db
        .prepare(
          `DELETE FROM ${table} WHERE last_at <= ?1 AND (locked_until IS NULL OR locked_until <= ?2)`,
        )
        .bind(now - LOCK_SECONDS, now),
    ),
  );
}

async function recordLoginFailure(
  db: D1Database,
  email: string,
  address: string,
  now: number,
): Promise<void> {
  await purgeLoginFailures(db, now);
  const counting = `
       failures = CASE WHEN locked_until IS NOT NULL THEN 1 ELSE failures + 1 END,
       last_at = ?2,
       locked_until = CASE
         WHEN locked_until IS NULL AND failures + 1 >= ?3 THEN ?2 + ?4
         ELSE NULL
       END`;
  await db.batch([
    db
      .prepare(
        `INSERT INTO login_attempts (address, last_at, failures, locked_until, email)
           VALUES (?1, ?2, 1, CASE WHEN ?3 <= 1 THEN ?2 + ?4 END, ?5)
         ON CONFLICT (email, address) DO UPDATE SET ${counting}`,
      )
      .bind(address, now, MAX_LOGIN_FAILURES, LOCK_SECONDS, normalizeEmail(email)),
    db
      .prepare(
        `INSERT INTO login_addresses (address, last_at, failures, locked_until)
           VALUES (?1, ?2, 1, CASE WHEN ?3 <= 1 THEN ?2 + ?4 END)
         ON CONFLICT (address) DO UPDATE SET ${counting}`,
      )
      .bind(address, now, MAX_ADDRESS_FAILURES, LOCK_SECONDS),
  ]);
}

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'locked'; retryAfter: number };

export async function login(
  db: D1Database,
  email: string,
  password: string,
  address: string,
  now: number,
): Promise<LoginResult> {
  const wait = await lockedFor(db, email, address, now);
  if (wait > 0) return { ok: false, reason: 'locked', retryAfter: wait };
  const found = await findUserByEmail(db, email);
  const matches = await verifyPassword(password, found?.passwordHash || DUMMY_HASH);
  if (found && matches) {
    await db
      .prepare('DELETE FROM login_attempts WHERE email = ? AND address = ?')
      .bind(normalizeEmail(email), address)
      .run();
    const { id, email: userEmail, householdId, sessionVersion } = found;
    return { ok: true, user: { id, email: userEmail, householdId, sessionVersion } };
  }
  await recordLoginFailure(db, email, address, now);
  return { ok: false, reason: 'invalid' };
}
