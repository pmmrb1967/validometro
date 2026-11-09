// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Sync of the household's items. The server is the source of truth; each phone keeps a
 * copy (IndexedDB) and a queue of changes made offline.
 *
 *   POST /sync {changes: Item[], cursor} → {items: Item[], cursor, more}
 *
 * A change wins when its `updated_at` (the phone's clock at the change) is not older than
 * the stored one: last write wins, per item. Every write takes the next number of a server
 * counter (`server_seq`), and phones pull what came after the last number they saw, so
 * their clocks never decide what they miss.
 *
 *   POST /items/:id/status {status} → 204   (the notification's buttons, from the service worker)
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, userOf, type AppEnv } from './session';

export const sync = new Hono<AppEnv>();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instant = z.string().min(10).max(40);

export const itemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  category: z.string().max(40).nullable(),
  location: z.enum(['frigorifico', 'congelador', 'despensa']),
  ean: z.string().max(14).nullable(),
  quantity: z.number().positive().max(100_000).nullable(),
  unit: z.string().max(20).nullable(),
  purchased_at: instant.nullable(),
  opened_at: instant.nullable(),
  expires_at: isoDate.nullable(),
  expiry_source: z.enum(['impressa', 'estimada', 'manual']).nullable(),
  status: z.enum(['ativo', 'consumido', 'deitado_fora']),
  resolved_at: instant.nullable(),
  created_at: instant,
  updated_at: instant,
});
export type SyncedItem = z.infer<typeof itemSchema>;

export const MAX_CHANGES = 200;
export const PAGE = 500;

/** Changes are checked one by one: one bad item must not hold the others back forever. */
const SyncBody = z.object({
  changes: z.array(z.unknown()).max(MAX_CHANGES),
  cursor: z.number().int().min(0),
});

const COLUMNS = [
  'id',
  'household_id',
  'created_by',
  'name',
  'category',
  'location',
  'ean',
  'quantity',
  'unit',
  'purchased_at',
  'opened_at',
  'expires_at',
  'expiry_source',
  'status',
  'resolved_at',
  'created_at',
  'updated_at',
] as const;

const UPDATABLE = COLUMNS.filter(
  (column) => !['id', 'household_id', 'created_by', 'created_at'].includes(column),
);

const nextSeq = "(SELECT value FROM counters WHERE name = 'items')";

/** Two statements per change: take a number, then write if newer and in this household. */
function upsert(db: D1Database, householdId: string, userId: string, item: SyncedItem) {
  const row: Record<(typeof COLUMNS)[number], unknown> = {
    ...item,
    household_id: householdId,
    created_by: userId,
  };
  return [
    db.prepare("UPDATE counters SET value = value + 1 WHERE name = 'items'"),
    db
      .prepare(
        `INSERT INTO items (${COLUMNS.join(', ')}, server_seq)
         VALUES (${COLUMNS.map(() => '?').join(', ')}, ${nextSeq})
         ON CONFLICT (id) DO UPDATE SET
           ${UPDATABLE.map((column) => `${column} = excluded.${column}`).join(', ')},
           server_seq = excluded.server_seq
         WHERE items.household_id = excluded.household_id
           AND COALESCE(items.updated_at, items.created_at) <= excluded.updated_at`,
      )
      .bind(...COLUMNS.map((column) => row[column] ?? null)),
  ];
}

type ItemRow = SyncedItem & { household_id: string; created_by: string | null; server_seq: number };

sync.post('/sync', requireUser, async (c) => {
  const user = userOf(c);
  const parsed = SyncBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Pedido inválido.' }, 400);
  const { cursor } = parsed.data;
  const changes = parsed.data.changes.flatMap((change) => {
    const item = itemSchema.safeParse(change);
    return item.success ? [item.data] : [];
  });
  if (changes.length) {
    await c.env.DB.batch(
      changes.flatMap((item) => upsert(c.env.DB, user.householdId, user.id, item)),
    );
  }
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM items WHERE household_id = ? AND server_seq > ? ORDER BY server_seq LIMIT ?`,
  )
    .bind(user.householdId, cursor, PAGE)
    .all<ItemRow>();
  const items = results.map((row) => {
    const item: Partial<ItemRow> = { ...row, updated_at: row.updated_at ?? row.created_at };
    delete item.server_seq;
    return item;
  });
  const last = results.at(-1)?.server_seq ?? cursor;
  return c.json({ items, cursor: last, more: results.length === PAGE });
});

const StatusBody = z.object({ status: z.enum(['consumido', 'deitado_fora']) });

/** "Comido" / "Deitado fora" from the notification: the phone's copy catches up on next sync. */
sync.post('/items/:id/status', requireUser, async (c) => {
  const user = userOf(c);
  const parsed = StatusBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Pedido inválido.' }, 400);
  const at = new Date().toISOString();
  const [, update] = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE counters SET value = value + 1 WHERE name = 'items'"),
    c.env.DB.prepare(
      `UPDATE items SET status = ?, resolved_at = ?, updated_at = ?, server_seq = ${nextSeq}
       WHERE id = ? AND household_id = ? AND status = 'ativo'`,
    ).bind(parsed.data.status, at, at, c.req.param('id'), user.householdId),
  ]);
  return update?.meta.changes ? c.body(null, 204) : c.json({ error: 'Não encontrado.' }, 404);
});
