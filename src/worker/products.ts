// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Product by barcode: the D1 cache (`products`) first, else Open Food Facts (free, no key).
 * Misses are cached too, for less time, so an unknown code does not hit OFF on every scan.
 */
import { z } from 'zod';
import { categoryFromOffTags, suggestCategory } from '../domain/categories';

export interface Product {
  ean: string;
  found: boolean;
  name: string | null;
  brand: string | null;
  category: string | null;
}

interface ProductRow {
  ean: string;
  name: string | null;
  brand: string | null;
  category: string | null;
  fetched_at: string;
}

const DAY_MS = 86_400_000;
export const FOUND_TTL_DAYS = 90;
export const MISSING_TTL_DAYS = 7;

const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product/';
const OFF_FIELDS = 'product_name_pt,product_name,generic_name_pt,brands,categories_tags';
/** OFF asks API clients to identify themselves; the app's name and repository, no personal data. */
export const OFF_USER_AGENT = 'Validometro/0.1 (+https://github.com/pmmrb1967/validometro)';

const offResponse = z.object({
  status: z.number(),
  product: z
    .object({
      product_name_pt: z.string().optional(),
      product_name: z.string().optional(),
      generic_name_pt: z.string().optional(),
      brands: z.string().optional(),
      categories_tags: z.array(z.string()).optional(),
    })
    .optional(),
});

function fresh(row: ProductRow, now: Date): boolean {
  const ttl = (row.name ? FOUND_TTL_DAYS : MISSING_TTL_DAYS) * DAY_MS;
  return now.getTime() - Date.parse(row.fetched_at) < ttl;
}

function toProduct({ ean, name, brand, category }: Omit<ProductRow, 'fetched_at'>): Product {
  return { ean, found: name !== null, name, brand, category };
}

/** Parses an OFF answer; null name when OFF does not know the code. */
export function fromOpenFoodFacts(ean: string, body: unknown): Omit<ProductRow, 'fetched_at'> {
  const parsed = offResponse.safeParse(body);
  const product = parsed.success && parsed.data.status === 1 ? parsed.data.product : undefined;
  const name =
    [product?.product_name_pt, product?.product_name, product?.generic_name_pt]
      .map((value) => value?.trim())
      .find((value) => value) ?? null;
  const brand = product?.brands?.split(',')[0]?.trim() || null;
  const category =
    categoryFromOffTags(product?.categories_tags ?? []) ??
    (name ? suggestCategory(name) : undefined) ??
    null;
  return { ean, name, brand, category };
}

export async function lookupProduct(
  db: D1Database,
  ean: string,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<Product> {
  const cached = await db
    .prepare('SELECT ean, name, brand, category, fetched_at FROM products WHERE ean = ?')
    .bind(ean)
    .first<ProductRow>();
  if (cached && fresh(cached, now)) return toProduct(cached);

  let row: Omit<ProductRow, 'fetched_at'>;
  try {
    const res = await fetcher(`${OFF_URL}${ean}?fields=${OFF_FIELDS}`, {
      headers: { 'User-Agent': OFF_USER_AGENT, Accept: 'application/json' },
    });
    // 404 is OFF's "unknown product" (with a JSON body); anything else is OFF being unwell.
    if (!res.ok && res.status !== 404) throw new Error(`Open Food Facts ${res.status}`);
    row = fromOpenFoodFacts(ean, await res.json());
  } catch (err) {
    // OFF unreachable: an old cached answer is better than none; else let the caller say so.
    if (cached) return toProduct(cached);
    throw err;
  }

  await db
    .prepare(
      `INSERT INTO products (ean, name, brand, category, fetched_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (ean) DO UPDATE SET name = excluded.name, brand = excluded.brand,
         category = excluded.category, fetched_at = excluded.fetched_at`,
    )
    .bind(row.ean, row.name, row.brand, row.category, now.toISOString())
    .run();
  return toProduct(row);
}
