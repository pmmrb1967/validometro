// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Sync of the household's items, shopping list and saved recipes. The server is the source of truth; each
 * phone keeps a copy (IndexedDB) and a queue of changes made offline.
 *
 *   POST /sync {changes: Item[], shopping?: ShoppingEntry[], recipes?: SavedRecipe[], cursor}
 *     → {items, shopping, recipes, cursor, more, rules: RuleOverride[]}
 *       (rules: all the household's own shelf-life days, a few rows at most)
 *
 * A change wins when its `updated_at` (the phone's clock at the change) is not older than
 * the stored one: last write wins, per row. Every write takes the next number of a server
 * counter (`server_seq`, one counter for both tables), and phones pull what came after the
 * last number they saw, so their clocks never decide what they miss.
 *
 *   POST /items/:id/status {status} → 204   (the notification's buttons, from the service worker)
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { RECIPE_STATES } from '../domain/recipes';
import { SHOPPING_STATES } from '../domain/shopping';
import { EXPIRY_KINDS } from '../domain/types';
import { requireUser, userOf, type AppEnv } from './session';
import { householdOverrides } from './rules';

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
  // Absent from phones still on an older version.
  expiry_kind: z.enum(EXPIRY_KINDS).nullable().default(null),
  price: z.number().min(0).max(10_000).nullable().default(null),
  status: z.enum(['ativo', 'consumido', 'deitado_fora']),
  resolved_at: instant.nullable(),
  created_at: instant,
  updated_at: instant,
});
export type SyncedItem = z.infer<typeof itemSchema>;

export const shoppingSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  category: z.string().max(40).nullable(),
  source: z.enum(['auto', 'manual']),
  state: z.enum(SHOPPING_STATES),
  item_id: z.string().uuid().nullable(),
  created_at: instant,
  updated_at: instant,
});
export type SyncedShopping = z.infer<typeof shoppingSchema>;

const words = z.array(z.string().trim().min(1).max(200)).max(40);
export const recipeSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  minutes: z.number().int().min(0).max(1440),
  usa: words,
  falta: words,
  steps: z.array(z.string().trim().min(1).max(1000)).max(30),
  item_ids: z.array(z.string().uuid()).max(40),
  starred: z.boolean(),
  state: z.enum(RECIPE_STATES),
  created_at: instant,
  updated_at: instant,
});
export type SyncedRecipe = z.infer<typeof recipeSchema>;

/** The note of a receipt saved (domain/receipts.ts): hashes, the shop's name and the day. */
export const receiptSchema = z.object({
  id: z.string().uuid(),
  qr_hash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  store: z.string().trim().max(120).nullable(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  lines: z.array(z.string().regex(/^[0-9a-f]{8}$/)).max(300),
  items: z.number().int().min(0).max(1000),
  created_at: instant,
  updated_at: instant,
});
export type SyncedReceipt = z.infer<typeof receiptSchema>;

export const MAX_CHANGES = 200;
export const PAGE = 500;

/** Changes are checked one by one: one bad row must not hold the others back forever. */
const SyncBody = z.object({
  changes: z.array(z.unknown()).max(MAX_CHANGES),
  shopping: z.array(z.unknown()).max(MAX_CHANGES).default([]),
  recipes: z.array(z.unknown()).max(MAX_CHANGES).default([]),
  receipts: z.array(z.unknown()).max(MAX_CHANGES).default([]),
  cursor: z.number().int().min(0),
});

const ITEM_COLUMNS = [
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
  'expiry_kind',
  'price',
  'status',
  'resolved_at',
  'created_at',
  'updated_at',
] as const;

const SHOPPING_COLUMNS = [
  'id',
  'household_id',
  'name',
  'category',
  'source',
  'state',
  'item_id',
  'created_at',
  'updated_at',
  'done',
] as const;

const RECIPE_COLUMNS = [
  'id',
  'household_id',
  'created_by',
  'title',
  'minutes',
  'usa',
  'falta',
  'steps',
  'item_ids',
  'starred',
  'state',
  'created_at',
  'updated_at',
] as const;

const RECEIPT_COLUMNS = [
  'id',
  'household_id',
  'created_by',
  'qr_hash',
  'store',
  'date',
  'lines',
  'items',
  'created_at',
  'updated_at',
] as const;

const FIXED = ['id', 'household_id', 'created_by', 'created_at'];
const nextSeq = "(SELECT value FROM counters WHERE name = 'items')";
const bump = (db: D1Database) =>
  db.prepare("UPDATE counters SET value = value + 1 WHERE name = 'items'");

/**
 * Two statements per change: take a number, then write if newer and in this household
 * (an id from another household is never overwritten).
 */
function upsert(
  db: D1Database,
  table: 'items' | 'shopping_list' | 'recipes' | 'receipts',
  columns: readonly string[],
  row: Record<string, unknown>,
) {
  const updatable = columns.filter((column) => !FIXED.includes(column));
  return [
    bump(db),
    db
      .prepare(
        `INSERT INTO ${table} (${columns.join(', ')}, server_seq)
         VALUES (${columns.map(() => '?').join(', ')}, ${nextSeq})
         ON CONFLICT (id) DO UPDATE SET
           ${updatable.map((column) => `${column} = excluded.${column}`).join(', ')},
           server_seq = excluded.server_seq
         WHERE ${table}.household_id = excluded.household_id
           AND COALESCE(${table}.updated_at, ${table}.created_at) <= excluded.updated_at`,
      )
      .bind(...columns.map((column) => row[column] ?? null)),
  ];
}

type ItemRow = SyncedItem & { household_id: string; created_by: string | null; server_seq: number };
type ShoppingRow = SyncedShopping & { household_id: string; done: number; server_seq: number };
type RecipeRow = {
  [K in keyof SyncedRecipe]: K extends 'usa' | 'falta' | 'steps' | 'item_ids'
    ? string
    : K extends 'starred'
      ? number
      : SyncedRecipe[K];
} & { household_id: string; created_by: string | null; server_seq: number };

function recipeOut(row: RecipeRow) {
  const list = (text: string): string[] => {
    try {
      const value: unknown = JSON.parse(text);
      return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
    } catch {
      return [];
    }
  };
  return {
    id: row.id,
    household_id: row.household_id,
    title: row.title,
    minutes: row.minutes,
    usa: list(row.usa),
    falta: list(row.falta),
    steps: list(row.steps),
    item_ids: list(row.item_ids),
    starred: row.starred === 1,
    state: row.state,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

type ReceiptRow = Omit<SyncedReceipt, 'lines'> & {
  lines: string;
  household_id: string;
  created_by: string | null;
  server_seq: number;
};

function receiptOut(row: ReceiptRow) {
  let lines: string[] = [];
  try {
    const value: unknown = JSON.parse(row.lines);
    if (Array.isArray(value)) lines = value.filter((entry) => typeof entry === 'string');
  } catch {
    // Unreadable: compared as if it had no lines.
  }
  return {
    id: row.id,
    household_id: row.household_id,
    qr_hash: row.qr_hash,
    store: row.store,
    date: row.date,
    lines,
    items: row.items,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function valid<T>(schema: z.ZodType<T>, list: unknown[]): T[] {
  return list.flatMap((change) => {
    const parsed = schema.safeParse(change);
    return parsed.success ? [parsed.data] : [];
  });
}

sync.post('/sync', requireUser, async (c) => {
  const user = userOf(c);
  const db = c.env.DB;
  const parsed = SyncBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Pedido inválido.' }, 400);
  const { cursor } = parsed.data;
  const items = valid(itemSchema, parsed.data.changes);
  const shopping = valid(shoppingSchema, parsed.data.shopping);
  const recipes = valid(recipeSchema, parsed.data.recipes);
  const receipts = valid(receiptSchema, parsed.data.receipts);
  if (items.length || shopping.length || recipes.length || receipts.length) {
    await db.batch([
      ...items.flatMap((item) =>
        upsert(db, 'items', ITEM_COLUMNS, {
          ...item,
          household_id: user.householdId,
          created_by: user.id,
        }),
      ),
      ...shopping.flatMap((entry) =>
        upsert(db, 'shopping_list', SHOPPING_COLUMNS, {
          ...entry,
          household_id: user.householdId,
          done: entry.state === 'comprado' ? 1 : 0,
        }),
      ),
      ...recipes.flatMap((recipe) =>
        upsert(db, 'recipes', RECIPE_COLUMNS, {
          ...recipe,
          household_id: user.householdId,
          created_by: user.id,
          usa: JSON.stringify(recipe.usa),
          falta: JSON.stringify(recipe.falta),
          steps: JSON.stringify(recipe.steps),
          item_ids: JSON.stringify(recipe.item_ids),
          starred: recipe.starred ? 1 : 0,
        }),
      ),
      ...receipts.flatMap((receipt) =>
        upsert(db, 'receipts', RECEIPT_COLUMNS, {
          ...receipt,
          household_id: user.householdId,
          created_by: user.id,
          lines: JSON.stringify(receipt.lines),
        }),
      ),
    ]);
  }

  const [itemRows, shoppingRows, recipeRows, receiptRows, overrides] = await Promise.all([
    db
      .prepare(
        'SELECT * FROM items WHERE household_id = ? AND server_seq > ? ORDER BY server_seq LIMIT ?',
      )
      .bind(user.householdId, cursor, PAGE)
      .all<ItemRow>(),
    db
      .prepare(
        `SELECT * FROM shopping_list WHERE household_id = ? AND server_seq > ?
         ORDER BY server_seq LIMIT ?`,
      )
      .bind(user.householdId, cursor, PAGE)
      .all<ShoppingRow>(),
    db
      .prepare(
        'SELECT * FROM recipes WHERE household_id = ? AND server_seq > ? ORDER BY server_seq LIMIT ?',
      )
      .bind(user.householdId, cursor, PAGE)
      .all<RecipeRow>(),
    db
      .prepare(
        'SELECT * FROM receipts WHERE household_id = ? AND server_seq > ? ORDER BY server_seq LIMIT ?',
      )
      .bind(user.householdId, cursor, PAGE)
      .all<ReceiptRow>(),
    householdOverrides(db, user.householdId),
  ]);
  // One cursor for both: a full page of either stops both at its last number, or rows of
  // the other table beyond it would be skipped.
  const cuts = [itemRows.results, shoppingRows.results, recipeRows.results, receiptRows.results]
    .filter((rows) => rows.length === PAGE)
    .map((rows) => rows.at(-1)!.server_seq);
  const cut = cuts.length ? Math.min(...cuts) : Infinity;
  const pickedItems = itemRows.results.filter((row) => row.server_seq <= cut);
  const pickedShopping = shoppingRows.results.filter((row) => row.server_seq <= cut);
  const pickedRecipes = recipeRows.results.filter((row) => row.server_seq <= cut);
  const pickedReceipts = receiptRows.results.filter((row) => row.server_seq <= cut);

  const outItems = pickedItems.map((row) => {
    const item: Partial<ItemRow> = { ...row, updated_at: row.updated_at ?? row.created_at };
    delete item.server_seq;
    return item;
  });
  const outShopping = pickedShopping.map((row) => {
    const entry: Partial<ShoppingRow> = { ...row, updated_at: row.updated_at ?? row.created_at };
    delete entry.server_seq;
    delete entry.done;
    return entry;
  });
  const seqs = [...pickedItems, ...pickedShopping, ...pickedRecipes, ...pickedReceipts].map(
    (row) => row.server_seq,
  );
  const last = Number.isFinite(cut) ? cut : Math.max(cursor, ...seqs);
  return c.json({
    items: outItems,
    shopping: outShopping,
    recipes: pickedRecipes.map(recipeOut),
    receipts: pickedReceipts.map(receiptOut),
    cursor: last,
    more: Number.isFinite(cut),
    rules: overrides,
  });
});

const StatusBody = z.object({ status: z.enum(['consumido', 'deitado_fora']) });

/** "Comido" / "Deitado fora" from the notification: the phone's copy catches up on next sync. */
sync.post('/items/:id/status', requireUser, async (c) => {
  const user = userOf(c);
  const db = c.env.DB;
  const parsed = StatusBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Pedido inválido.' }, 400);
  const at = new Date().toISOString();
  const id = c.req.param('id');
  const [, update] = await db.batch([
    bump(db),
    db
      .prepare(
        `UPDATE items SET status = ?, resolved_at = ?, updated_at = ?, server_seq = ${nextSeq}
         WHERE id = ? AND household_id = ? AND status = 'ativo'`,
      )
      .bind(parsed.data.status, at, at, id, user.householdId),
  ]);
  if (!update?.meta.changes) return c.json({ error: 'Não encontrado.' }, 404);
  if (parsed.data.status === 'consumido') {
    // Eaten: suggest buying it again, unless the list already has it (as the app does).
    await db.batch([
      bump(db),
      db
        .prepare(
          `INSERT INTO shopping_list (id, household_id, name, category, source, state, item_id,
             created_at, updated_at, server_seq)
           SELECT ?, household_id, name, category, 'auto', 'sugerido', id, ?, ?, ${nextSeq}
           FROM items i WHERE id = ? AND household_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM shopping_list s
               WHERE s.household_id = i.household_id AND s.state IN ('sugerido', 'pendente')
                 AND lower(trim(s.name)) = lower(trim(i.name)))`,
        )
        .bind(crypto.randomUUID(), at, at, id, user.householdId),
    ]);
  }
  return c.body(null, 204);
});
