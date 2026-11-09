// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Households: everyone in one sees the same fridge. Each account starts with its own; an
 * invite code (or link) joins another. A person is in exactly one household at a time.
 */
import { normalizeEmail, type User } from './auth';

/** No 0/O or 1/I: codes are read aloud and typed on phones. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;

export function newInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITE_CODE_LENGTH));
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

/** "abcd-efgh", spaces, lower case: all the same code. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function defaultName(email: string): string {
  const who = email.split('@')[0] ?? '';
  return `Casa de ${who.slice(0, 40)}`;
}

/** Statements that renumber a household's items, so the members pull them again (sync.ts). */
function renumberItems(db: D1Database, householdId: string): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE items SET server_seq = (SELECT value FROM counters WHERE name = 'items') + rowid
         WHERE household_id = ?`,
      )
      .bind(householdId),
    db.prepare(
      `UPDATE counters SET value = value + COALESCE((SELECT MAX(rowid) FROM items), 0)
       WHERE name = 'items'`,
    ),
  ];
}

export async function createAccount(
  db: D1Database,
  email: string,
  passwordHash: string,
): Promise<User | null> {
  const user: User = {
    id: crypto.randomUUID(),
    email: normalizeEmail(email),
    householdId: crypto.randomUUID(),
    sessionVersion: 1,
  };
  try {
    await db.batch([
      db
        .prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)')
        .bind(user.id, user.email, passwordHash),
      db
        .prepare('INSERT INTO households (id, name, invite_code) VALUES (?, ?, ?)')
        .bind(user.householdId, defaultName(user.email), newInviteCode()),
      db
        .prepare(
          "INSERT INTO household_members (household_id, user_id, role) VALUES (?, ?, 'owner')",
        )
        .bind(user.householdId, user.id),
    ]);
  } catch (err) {
    if (err instanceof Error && /UNIQUE/i.test(err.message)) return null;
    throw err;
  }
  return user;
}

export interface HouseholdInfo {
  id: string;
  name: string;
  inviteCode: string;
  members: { email: string; role: 'owner' | 'member'; you: boolean }[];
}

export async function householdInfo(db: D1Database, user: User): Promise<HouseholdInfo | null> {
  const household = await db
    .prepare('SELECT id, name, invite_code FROM households WHERE id = ?')
    .bind(user.householdId)
    .first<{ id: string; name: string; invite_code: string }>();
  if (!household) return null;
  const { results } = await db
    .prepare(
      `SELECT u.id, u.email, m.role FROM household_members m JOIN users u ON u.id = m.user_id
       WHERE m.household_id = ? ORDER BY m.role DESC, u.email`,
    )
    .bind(user.householdId)
    .all<{ id: string; email: string; role: 'owner' | 'member' }>();
  return {
    id: household.id,
    name: household.name,
    inviteCode: household.invite_code,
    members: results.map((row) => ({ email: row.email, role: row.role, you: row.id === user.id })),
  };
}

async function memberCount(db: D1Database, householdId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM household_members WHERE household_id = ?')
    .bind(householdId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export type JoinResult = 'joined' | 'already' | 'not_found';

/**
 * Joins the household with this code. Someone alone brings their items along (the old
 * household is then empty and goes); someone leaving others behind leaves the items there.
 */
export async function joinHousehold(db: D1Database, user: User, code: string): Promise<JoinResult> {
  const target = await db
    .prepare('SELECT id FROM households WHERE invite_code = ?')
    .bind(normalizeCode(code))
    .first<{ id: string }>();
  if (!target) return 'not_found';
  if (target.id === user.householdId) return 'already';
  const alone = (await memberCount(db, user.householdId)) <= 1;
  const statements = [
    db.prepare('DELETE FROM household_members WHERE user_id = ?').bind(user.id),
    db
      .prepare(
        "INSERT INTO household_members (household_id, user_id, role) VALUES (?, ?, 'member')",
      )
      .bind(target.id, user.id),
  ];
  if (alone) {
    statements.push(
      db
        .prepare('UPDATE items SET household_id = ? WHERE household_id = ?')
        .bind(target.id, user.householdId),
      ...renumberItems(db, target.id),
      db.prepare('DELETE FROM households WHERE id = ?').bind(user.householdId),
    );
  }
  await db.batch(statements);
  return 'joined';
}

/** Leaves for a new household of one's own; the items stay with those who remain. */
export async function leaveHousehold(db: D1Database, user: User): Promise<boolean> {
  if ((await memberCount(db, user.householdId)) <= 1) return false;
  const id = crypto.randomUUID();
  await db.batch([
    db
      .prepare('INSERT INTO households (id, name, invite_code) VALUES (?, ?, ?)')
      .bind(id, defaultName(user.email), newInviteCode()),
    db.prepare('DELETE FROM household_members WHERE user_id = ?').bind(user.id),
    db
      .prepare("INSERT INTO household_members (household_id, user_id, role) VALUES (?, ?, 'owner')")
      .bind(id, user.id),
    // If the owner left, the longest-standing member takes over.
    db
      .prepare(
        `UPDATE household_members SET role = 'owner'
         WHERE household_id = ?1 AND NOT EXISTS (
           SELECT 1 FROM household_members WHERE household_id = ?1 AND role = 'owner'
         ) AND user_id = (SELECT user_id FROM household_members WHERE household_id = ?1 LIMIT 1)`,
      )
      .bind(user.householdId),
  ]);
  return true;
}

export async function renameHousehold(db: D1Database, user: User, name: string): Promise<void> {
  await db
    .prepare('UPDATE households SET name = ? WHERE id = ?')
    .bind(name, user.householdId)
    .run();
}

/** A new code: the old link stops working (someone shared it too widely). */
export async function newHouseholdCode(db: D1Database, user: User): Promise<string> {
  const code = newInviteCode();
  await db
    .prepare('UPDATE households SET invite_code = ? WHERE id = ?')
    .bind(code, user.householdId)
    .run();
  return code;
}
