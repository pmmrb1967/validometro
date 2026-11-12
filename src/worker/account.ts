// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Accounts, sign-in and households (adapted from Wattómetro, server/src/routes/account.ts).
 *
 *   POST /auth/register {email, password}   → Me + cookie; 409 the email has an account
 *   POST /auth/login    {email, password}   → Me + cookie; 401; 429 locked (Retry-After)
 *   POST /auth/logout                       → 204
 *   GET  /auth/me                           → {user: Me | null}
 *   POST /account/password {current, next}  → 204; other devices are signed out
 *   PUT  /account/ai {provider, key?, model?} → 204 (the key sealed with AES-GCM)
 *   DELETE /account {password}              → 204; an empty household goes with its items
 *   GET  /account/export                    → JSON file with everything kept (RGPD)
 *   GET  /household; PUT /household {name}; POST /household/join {code};
 *   POST /household/leave; POST /household/code (a new invite code)
 */
import { Hono, type Context } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { CLAUDE_MODELS } from '../ai/providers/anthropic';
import { addressKey, login, SESSION_COOKIE, type User } from './auth';
import {
  createAccount,
  householdInfo,
  joinHousehold,
  leaveHousehold,
  newHouseholdCode,
  renameHousehold,
} from './households';
import { hashPassword, MIN_PASSWORD_LENGTH } from './password';
import { open, seal } from './secret-box';
import {
  COOKIE_OPTIONS,
  isAdmin,
  markSeen,
  nowSeconds,
  requireUser,
  sessionSecret,
  startSession,
  trustedOrigin,
  userOf,
  type AppEnv,
} from './session';
import { householdOverrides } from './rules';

export const account = new Hono<AppEnv>();

/** Provider ids: the API's and the database's (CHECK in migrations/0001_init.sql). */
const TO_DB = { 'workers-ai': 'workers_ai', gemini: 'gemini', anthropic: 'claude' } as const;
const FROM_DB = { workers_ai: 'workers-ai', gemini: 'gemini', claude: 'anthropic' } as const;
type ProviderChoice = keyof typeof TO_DB;

const email = z.string().trim().toLowerCase().email().max(254);
const Credentials = z.object({ email, password: z.string().min(1).max(1024) });
const NewCredentials = z.object({
  email,
  password: z.string().min(MIN_PASSWORD_LENGTH).max(1024),
});

async function body<T>(c: Context<AppEnv>, schema: z.ZodType<T>) {
  return schema.safeParse(await c.req.json().catch(() => null));
}

interface AiRow {
  ai_provider: keyof typeof FROM_DB;
  ai_model: string | null;
  ai_key_encrypted: string | null;
}

async function aiRow(db: D1Database, user: User): Promise<AiRow | null> {
  return db
    .prepare('SELECT ai_provider, ai_model, ai_key_encrypted FROM users WHERE id = ?')
    .bind(user.id)
    .first<AiRow>();
}

/** The user's own AI key, opened for one request; null when there is none. */
export async function storedAi(
  env: Env,
  user: User,
): Promise<{ provider: ProviderChoice; key: string | null; model: string | null }> {
  const row = await aiRow(env.DB, user);
  const provider = FROM_DB[row?.ai_provider ?? 'workers_ai'];
  const key =
    row?.ai_key_encrypted && env.KEY_ENCRYPTION_SECRET
      ? await open(env.KEY_ENCRYPTION_SECRET, row.ai_key_encrypted, user.id)
      : null;
  return { provider, key, model: row?.ai_model ?? null };
}

/**
 * How the saved key is shown back: its prefix and last 4 characters ("sk-ant-…0gAA"), enough
 * to tell which key it is, never enough to use it.
 */
export function keyHint(key: string): string {
  const prefix = ['sk-ant-', 'AIza'].find((start) => key.startsWith(start)) ?? '';
  return `${prefix}…${key.slice(-4)}`;
}

async function savedKeyHint(env: Env, user: User, sealed: string | null | undefined) {
  if (!sealed || !env.KEY_ENCRYPTION_SECRET) return null;
  try {
    const key = await open(env.KEY_ENCRYPTION_SECRET, sealed, user.id);
    return key && key.length > 8 ? keyHint(key) : null;
  } catch {
    return null;
  }
}

async function me(c: Context<AppEnv>, user: User) {
  const household = await householdInfo(c.env.DB, user);
  const ai = await aiRow(c.env.DB, user);
  const hint = await savedKeyHint(c.env, user, ai?.ai_key_encrypted);
  return {
    email: user.email,
    household: household && { id: household.id, name: household.name },
    admin: isAdmin(c.env, user),
    ai: {
      provider: FROM_DB[ai?.ai_provider ?? 'workers_ai'],
      model: ai?.ai_model ?? null,
      hasKey: Boolean(ai?.ai_key_encrypted),
      keyHint: hint,
    },
  };
}

const address = (c: Context<AppEnv>) =>
  addressKey(c.req.header('CF-Connecting-IP'), sessionSecret(c));

function locked(c: Context<AppEnv>, retryAfter: number) {
  c.header('Retry-After', String(retryAfter));
  const minutes = Math.ceil(retryAfter / 60);
  return c.json(
    {
      error: `Demasiadas tentativas. Tenta daqui a ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`,
    },
    429,
  );
}

account.post('/auth/register', async (c) => {
  if (!trustedOrigin(c)) return c.json({ error: 'Pedido recusado.' }, 403);
  const parsed = await body(c, NewCredentials);
  if (!parsed.success) {
    return c.json(
      {
        error: `Indica um email válido e uma palavra-passe com pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      },
      400,
    );
  }
  const user = await createAccount(
    c.env.DB,
    parsed.data.email,
    await hashPassword(parsed.data.password),
  );
  if (!user) return c.json({ error: 'Já existe uma conta com este email. Entra com ela.' }, 409);
  await startSession(c, user);
  return c.json({ user: await me(c, user) }, 201);
});

account.post('/auth/login', async (c) => {
  if (!trustedOrigin(c)) return c.json({ error: 'Pedido recusado.' }, 403);
  const parsed = await body(c, Credentials);
  if (!parsed.success) return c.json({ error: 'Indica o email e a palavra-passe.' }, 400);
  const result = await login(
    c.env.DB,
    parsed.data.email,
    parsed.data.password,
    await address(c),
    nowSeconds(),
  );
  if (!result.ok) {
    if (result.reason === 'locked') return locked(c, result.retryAfter);
    return c.json({ error: 'Email ou palavra-passe errados.' }, 401);
  }
  await startSession(c, result.user);
  return c.json({ user: await me(c, result.user) });
});

account.post('/auth/logout', (c) => {
  if (!trustedOrigin(c)) return c.json({ error: 'Pedido recusado.' }, 403);
  deleteCookie(c, SESSION_COOKIE, COOKIE_OPTIONS);
  return c.body(null, 204);
});

account.get('/auth/me', async (c) => {
  const user = c.get('user');
  if (user) await markSeen(c.env.DB, user);
  return c.json({ user: user ? await me(c, user) : null });
});

const PasswordBody = z.object({
  current: z.string().min(1).max(1024),
  next: z.string().min(MIN_PASSWORD_LENGTH).max(1024),
});

account.post('/account/password', requireUser, async (c) => {
  const user = userOf(c);
  const parsed = await body(c, PasswordBody);
  if (!parsed.success) {
    return c.json(
      { error: `A nova palavra-passe precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` },
      400,
    );
  }
  const check = await login(
    c.env.DB,
    user.email,
    parsed.data.current,
    await address(c),
    nowSeconds(),
  );
  if (!check.ok) {
    if (check.reason === 'locked') return locked(c, check.retryAfter);
    return c.json({ error: 'A palavra-passe atual está errada.' }, 403);
  }
  await c.env.DB.prepare(
    'UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?',
  )
    .bind(await hashPassword(parsed.data.next), user.id)
    .run();
  await startSession(c, { ...user, sessionVersion: user.sessionVersion + 1 });
  return c.body(null, 204);
});

const AiBody = z.object({
  provider: z.enum(['workers-ai', 'gemini', 'anthropic']),
  /** Absent: keep the stored key; empty: forget it. */
  key: z.string().trim().max(300).optional(),
  model: z.enum(CLAUDE_MODELS).nullable().optional(),
});

account.put('/account/ai', requireUser, async (c) => {
  const user = userOf(c);
  const parsed = await body(c, AiBody);
  if (!parsed.success) return c.json({ error: 'Pedido inválido.' }, 400);
  const { provider, key, model } = parsed.data;
  if (key && !c.env.KEY_ENCRYPTION_SECRET) {
    return c.json({ error: 'O servidor ainda não guarda chaves. Tenta mais tarde.' }, 503);
  }
  const statements = [
    c.env.DB.prepare('UPDATE users SET ai_provider = ?, ai_model = ? WHERE id = ?').bind(
      TO_DB[provider],
      model ?? null,
      user.id,
    ),
  ];
  if (key !== undefined) {
    const sealed = key ? await seal(c.env.KEY_ENCRYPTION_SECRET!, key, user.id) : null;
    statements.push(
      c.env.DB.prepare('UPDATE users SET ai_key_encrypted = ? WHERE id = ?').bind(sealed, user.id),
    );
  }
  await c.env.DB.batch(statements);
  return c.body(null, 204);
});

account.delete('/account', requireUser, async (c) => {
  const user = userOf(c);
  const parsed = await body(c, z.object({ password: z.string().min(1).max(1024) }));
  if (!parsed.success) return c.json({ error: 'Indica a palavra-passe.' }, 400);
  const check = await login(
    c.env.DB,
    user.email,
    parsed.data.password,
    await address(c),
    nowSeconds(),
  );
  if (!check.ok) {
    if (check.reason === 'locked') return locked(c, check.retryAfter);
    return c.json({ error: 'A palavra-passe está errada.' }, 403);
  }
  // Leaving others behind keeps the household; alone, it goes (with its items, by cascade).
  await leaveHousehold(c.env.DB, user);
  const own = (
    await c.env.DB.prepare('SELECT household_id FROM household_members WHERE user_id = ?')
      .bind(user.id)
      .first<{ household_id: string }>()
  )?.household_id;
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM households WHERE id = ?').bind(own ?? user.householdId),
  ]);
  deleteCookie(c, SESSION_COOKIE, COOKIE_OPTIONS);
  return c.body(null, 204);
});

/**
 * Everything the server keeps about the user and their household (RGPD, right of access and
 * portability), as one JSON file. Never the password nor the AI key, only whether there is one.
 */
account.get('/account/export', requireUser, async (c) => {
  const user = userOf(c);
  const db = c.env.DB;
  const [profile, household, items, shopping, devices, usage, overrides, recipes, receipts] =
    await Promise.all([
      db
        .prepare(
          'SELECT email, created_at, ai_provider, ai_model, ai_key_encrypted FROM users WHERE id = ?',
        )
        .bind(user.id)
        .first<{
          email: string;
          created_at: string;
          ai_provider: keyof typeof FROM_DB;
          ai_model: string | null;
          ai_key_encrypted: string | null;
        }>(),
      householdInfo(db, user),
      db
        .prepare(
          `SELECT id, name, category, location, ean, quantity, unit, purchased_at, opened_at,
                expires_at, expiry_source, expiry_kind, price, receipt_id, status, resolved_at,
                created_at, updated_at
         FROM items WHERE household_id = ? ORDER BY created_at`,
        )
        .bind(user.householdId)
        .all(),
      db
        .prepare(
          `SELECT id, name, category, source, state, item_id, created_at, updated_at
         FROM shopping_list WHERE household_id = ? AND state <> 'removido' ORDER BY created_at`,
        )
        .bind(user.householdId)
        .all(),
      db
        .prepare('SELECT endpoint, created_at FROM push_subscriptions WHERE user_id = ?')
        .bind(user.id)
        .all<{ endpoint: string; created_at: string }>(),
      db
        .prepare('SELECT date, provider, operation, ok FROM ai_usage WHERE user_id = ? ORDER BY id')
        .bind(user.id)
        .all<{ date: string; provider: string; operation: string; ok: number }>(),
      householdOverrides(db, user.householdId),
      db
        .prepare(
          `SELECT id, title, minutes, usa, falta, steps, starred, state, created_at, updated_at
         FROM recipes WHERE household_id = ? AND state <> 'removida' ORDER BY created_at`,
        )
        .bind(user.householdId)
        .all<
          Record<string, unknown> & { usa: string; falta: string; steps: string; starred: number }
        >(),
      db
        .prepare(
          `SELECT id, qr_hash, store, date, lines, items, total, created_at FROM receipts
         WHERE household_id = ? ORDER BY created_at`,
        )
        .bind(user.householdId)
        .all<Record<string, unknown> & { lines: string }>(),
    ]);
  const exported = {
    exported_at: new Date().toISOString(),
    app: 'Validómetro (https://app.validometro.workers.dev)',
    account: profile && {
      email: profile.email,
      created_at: profile.created_at,
      ai_provider: FROM_DB[profile.ai_provider],
      ai_model: profile.ai_model,
      ai_key_saved: Boolean(profile.ai_key_encrypted),
    },
    household: household && {
      name: household.name,
      members: household.members.map(({ email: memberEmail, role }) => ({
        email: memberEmail,
        role,
      })),
    },
    items: items.results,
    shopping_list: shopping.results,
    shelf_life_overrides: overrides,
    recipes: recipes.results.map((row) => ({
      ...row,
      usa: JSON.parse(row.usa) as string[],
      falta: JSON.parse(row.falta) as string[],
      steps: JSON.parse(row.steps) as string[],
      starred: row.starred === 1,
    })),
    // Notes of the receipts saved (hashes, never the receipt): to tell one read twice.
    receipts: receipts.results.map((row) => ({
      ...row,
      lines: JSON.parse(row.lines) as string[],
    })),
    // The push service only: the address itself works as a credential for that phone.
    alert_devices: devices.results.map((row) => ({
      service: new URL(row.endpoint).host,
      created_at: row.created_at,
    })),
    ai_usage: usage.results.map((row) => ({ ...row, ok: row.ok === 1 })),
  };
  c.header('Content-Disposition', 'attachment; filename="validometro-dados.json"');
  c.header('Cache-Control', 'no-store');
  return c.json(exported);
});

account.get('/household', requireUser, async (c) => {
  const info = await householdInfo(c.env.DB, userOf(c));
  return info ? c.json(info) : c.json({ error: 'Não encontrado.' }, 404);
});

account.put('/household', requireUser, async (c) => {
  const parsed = await body(c, z.object({ name: z.string().trim().min(1).max(60) }));
  if (!parsed.success) return c.json({ error: 'Escreve um nome (até 60 caracteres).' }, 400);
  await renameHousehold(c.env.DB, userOf(c), parsed.data.name);
  return c.body(null, 204);
});

account.post('/household/join', requireUser, async (c) => {
  const parsed = await body(c, z.object({ code: z.string().trim().min(4).max(20) }));
  if (!parsed.success) return c.json({ error: 'Escreve o código de convite.' }, 400);
  const result = await joinHousehold(c.env.DB, userOf(c), parsed.data.code);
  if (result === 'not_found') {
    return c.json(
      { error: 'Não há nenhuma casa com esse código. Confirma-o com quem te convidou.' },
      404,
    );
  }
  return c.json({ result });
});

account.post('/household/leave', requireUser, async (c) => {
  const left = await leaveHousehold(c.env.DB, userOf(c));
  if (!left) return c.json({ error: 'Já és a única pessoa nesta casa.' }, 409);
  return c.body(null, 204);
});

account.post('/household/code', requireUser, async (c) =>
  c.json({ inviteCode: await newHouseholdCode(c.env.DB, userOf(c)) }),
);
