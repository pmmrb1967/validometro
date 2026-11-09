// SPDX-License-Identifier: AGPL-3.0-or-later
import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { SHELF_LIFE_RULES, type ShelfLifeRule } from '../src/domain/shelf-life';

it('the app ships the same shelf-life rules as the D1 seed', async () => {
  const { results } = await env.DB.prepare(
    'SELECT category, location, state, days_default, label, notes FROM shelf_life_rules',
  ).all<ShelfLifeRule>();
  const key = (rule: ShelfLifeRule) => `${rule.category}/${rule.location}/${rule.state}`;
  const sort = (rules: readonly ShelfLifeRule[]) =>
    [...rules].sort((a, b) => key(a).localeCompare(key(b)));
  expect(sort(results)).toEqual(sort(SHELF_LIFE_RULES));
});
