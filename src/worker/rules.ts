// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The household's own shelf-life days ("Regras de validade", Definições). The phone keeps a
 * copy and gets the household's from every sync (src/worker/sync.ts).
 *
 *   GET /household/rules → {overrides: RuleOverride[]}
 *   PUT /household/rules {category, location, state, days | null} → 204 (null: back to default)
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { isEditableRule, MAX_RULE_DAYS, type RuleOverride } from '../domain/shelf-life';
import { LOCATIONS } from '../domain/types';
import { requireUser, userOf, type AppEnv } from './session';

export const rules = new Hono<AppEnv>();

export async function householdOverrides(
  db: D1Database,
  householdId: string,
): Promise<RuleOverride[]> {
  const rows = await db
    .prepare(
      `SELECT category, location, state, days FROM shelf_life_overrides
       WHERE household_id = ? ORDER BY category, location, state`,
    )
    .bind(householdId)
    .all<RuleOverride>();
  return rows.results;
}

rules.get('/household/rules', requireUser, async (c) =>
  c.json({ overrides: await householdOverrides(c.env.DB, userOf(c).householdId) }),
);

const RuleBody = z.object({
  category: z.string().min(1).max(60),
  location: z.enum(LOCATIONS),
  state: z.enum(['fechado', 'aberto']),
  days: z.number().int().min(0).max(MAX_RULE_DAYS).nullable(),
});

rules.put('/household/rules', requireUser, async (c) => {
  const parsed = RuleBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Escreve um número de dias (0 a 3650).' }, 400);
  const rule = parsed.data;
  if (!isEditableRule(rule)) return c.json({ error: 'Esta regra não se pode mudar.' }, 400);
  const household = userOf(c).householdId;
  const db = c.env.DB;
  if (rule.days === null) {
    await db
      .prepare(
        'DELETE FROM shelf_life_overrides WHERE household_id = ? AND category = ? AND location = ? AND state = ?',
      )
      .bind(household, rule.category, rule.location, rule.state)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO shelf_life_overrides (household_id, category, location, state, days, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (household_id, category, location, state)
         DO UPDATE SET days = excluded.days, updated_at = excluded.updated_at`,
      )
      .bind(
        household,
        rule.category,
        rule.location,
        rule.state,
        rule.days,
        new Date().toISOString(),
      )
      .run();
  }
  return c.body(null, 204);
});
