// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The shared dictionary of receipt abbreviations (`product_aliases`). A known line overrides
 * the AI's guess; every confirmed review teaches it ("IOG NAT" → "Iogurte natural").
 */
import { aliasKey, storeKey, type KnownAlias } from '../domain/drafts';

interface AliasRow {
  raw_text_normalized: string;
  store: string;
  canonical_name: string;
  category: string | null;
  perishable: number;
  hits: number;
}

/**
 * Known aliases by key: the same store first, then any store, most confirmed first.
 * D1 caps bound parameters per query, so keys go in chunks.
 */
export async function lookupAliases(
  db: D1Database,
  raws: readonly string[],
  store: string | null,
): Promise<Map<string, KnownAlias>> {
  const keys = [...new Set(raws.map(aliasKey).filter(Boolean))];
  const shop = storeKey(store);
  const best = new Map<string, AliasRow>();
  for (let i = 0; i < keys.length; i += 90) {
    const chunk = keys.slice(i, i + 90);
    const { results } = await db
      .prepare(
        `SELECT * FROM product_aliases WHERE raw_text_normalized IN (${chunk.map(() => '?').join(',')})`,
      )
      .bind(...chunk)
      .all<AliasRow>();
    for (const row of results) {
      const current = best.get(row.raw_text_normalized);
      const rank = (r: AliasRow) => (r.store === shop ? 1_000_000 : 0) + r.hits;
      if (!current || rank(row) > rank(current)) best.set(row.raw_text_normalized, row);
    }
  }
  return new Map(
    [...best].map(([key, row]) => [
      key,
      {
        canonical_name: row.canonical_name,
        category: row.category,
        perishable: row.perishable === 1,
      },
    ]),
  );
}

export interface ConfirmedAlias {
  raw: string;
  name: string;
  category: string | null;
  perishable: boolean;
}

/** After the review: what the user kept (or corrected) becomes the known meaning. */
export async function saveAliases(
  db: D1Database,
  store: string | null,
  confirmed: readonly ConfirmedAlias[],
  now = new Date(),
): Promise<number> {
  const shop = storeKey(store);
  const statements = confirmed
    .map((entry) => ({ ...entry, key: aliasKey(entry.raw) }))
    .filter((entry) => entry.key && entry.name.trim())
    .map((entry) =>
      db
        .prepare(
          `INSERT INTO product_aliases (raw_text_normalized, store, canonical_name, category, perishable, hits, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?)
           ON CONFLICT (raw_text_normalized, store) DO UPDATE SET
             canonical_name = excluded.canonical_name,
             category = excluded.category,
             perishable = excluded.perishable,
             hits = product_aliases.hits + 1,
             updated_at = excluded.updated_at`,
        )
        .bind(
          entry.key,
          shop,
          entry.name.trim(),
          entry.category,
          entry.perishable ? 1 : 0,
          now.toISOString(),
        ),
    );
  if (statements.length) await db.batch(statements);
  return statements.length;
}
