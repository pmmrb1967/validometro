// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
import { Hono } from 'hono';
import { z } from 'zod';
import { isValidGtin } from '../domain/barcode';
import { account } from './account';
import { alerts } from './alerts';
import { ingest } from './ingest';
import { lookupProduct } from './products';
import { withUser, type AppEnv } from './session';
import { sync } from './sync';

const locationSchema = z.enum(['frigorifico', 'congelador', 'despensa']);

export const shelfLifeRuleSchema = z.object({
  category: z.string(),
  location: locationSchema,
  state: z.enum(['fechado', 'aberto']),
  days_default: z.number().int().nullable(),
  label: z.string(),
  notes: z.string().nullable(),
});
export type ShelfLifeRule = z.infer<typeof shelfLifeRuleSchema>;

export const app = new Hono<AppEnv>().basePath('/api');

app.use('*', withUser);

/** Liveness plus a round trip to D1, so a deploy shows the database is bound and migrated. */
app.get('/health', async (c) => {
  const row = await c.env.DB.prepare('SELECT COUNT(*) AS rules FROM shelf_life_rules').first<{
    rules: number;
  }>();
  return c.json({ ok: true, db: { shelfLifeRules: row?.rules ?? 0 } });
});

const rulesQuery = z.object({ location: locationSchema.optional() });

/** Fallback shelf-life table, used to suggest an expiry date when none is printed. */
app.get('/shelf-life-rules', async (c) => {
  const parsed = rulesQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'Localização inválida.' }, 400);
  const { location } = parsed.data;
  const stmt = location
    ? c.env.DB.prepare(
        'SELECT * FROM shelf_life_rules WHERE location = ? ORDER BY label, state',
      ).bind(location)
    : c.env.DB.prepare('SELECT * FROM shelf_life_rules ORDER BY label, location, state');
  const { results } = await stmt.all<ShelfLifeRule>();
  return c.json({ rules: results });
});

/** Product by barcode (D1 cache, then Open Food Facts): fills the name and category. */
app.get('/products/:ean', async (c) => {
  const ean = c.req.param('ean');
  if (!isValidGtin(ean)) return c.json({ error: 'Código de barras inválido.' }, 400);
  try {
    return c.json(await lookupProduct(c.env.DB, ean));
  } catch (err) {
    console.warn('Product lookup failed', err instanceof Error ? err.message : err);
    return c.json(
      { error: 'Não foi possível consultar o produto agora. Escreve o nome à mão.' },
      502,
    );
  }
});

app.route('/', ingest);
app.route('/', account);
app.route('/', sync);
app.route('/', alerts);

app.notFound((c) => c.json({ error: 'Não encontrado.' }, 404));

app.onError((err, c) => {
  console.error('Unhandled error', err.message);
  return c.json({ error: 'Ocorreu um erro inesperado. Tenta novamente.' }, 500);
});
