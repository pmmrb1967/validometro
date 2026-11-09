// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DraftItem } from '../domain/drafts';
import { aiHeaders } from './ai-settings';

export interface Product {
  ean: string;
  found: boolean;
  name: string | null;
  brand: string | null;
  category: string | null;
}

export class ApiError extends Error {}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

/** Product by barcode (D1 cache, then Open Food Facts). */
export async function fetchProduct(ean: string): Promise<Product> {
  let res: Response;
  try {
    res = await fetch(`/api/products/${encodeURIComponent(ean)}`);
  } catch {
    throw new ApiError('Sem ligação: escreve o nome à mão.');
  }
  if (!res.ok) throw new ApiError(await errorMessage(res, 'Não foi possível consultar o produto.'));
  return (await res.json()) as Product;
}

// --- Reading with AI (receipt, voice, printed date) -------------------------------------

export interface ReadingResult {
  store: string | null;
  date: string | null;
  drafts: DraftItem[];
}

async function postJson<T>(path: string, body: unknown, fallback: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...aiHeaders() },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Sem ligação à internet. Tenta mais tarde ou escreve à mão.');
  }
  if (!res.ok) throw new ApiError(await errorMessage(res, fallback));
  return (await res.json()) as T;
}

export function readReceipt(image: string): Promise<ReadingResult> {
  return postJson('/api/ingest/receipt', { image }, 'Não foi possível ler o talão.');
}

export function readSpoken(text: string): Promise<ReadingResult> {
  return postJson('/api/ingest/voice', { text }, 'Não foi possível perceber a lista.');
}

export function readPrintedDate(image: string): Promise<{ date: string; kind: string }> {
  return postJson('/api/ingest/date', { image }, 'Não foi possível ler a data.');
}

export function testAi(): Promise<{ ok: true; provider: string }> {
  return postJson('/api/ai/test', {}, 'A ligação falhou.');
}

/** After the review: teach the shared dictionary. Best effort, never blocks saving. */
export async function teachAliases(
  store: string | null,
  lines: { raw: string; name: string; category: string | null; perishable: boolean }[],
): Promise<void> {
  if (!lines.length) return;
  try {
    await fetch('/api/aliases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ store, lines }),
    });
  } catch {
    // Offline: the items are saved anyway; the dictionary learns next time.
  }
}

export interface Recipe {
  title: string;
  minutes: number;
  /** Items from the fridge it uses. */
  usa: string[];
  /** What is missing (beyond the basics every kitchen has). */
  falta: string[];
  steps: string[];
}

/** "O que jantar hoje?": what is about to go off, never stored. */
export function suggestRecipes(
  items: { name: string; days: number }[],
): Promise<{ recipes: Recipe[] }> {
  return postJson('/api/ai/recipes', { items }, 'Não foi possível pensar em receitas.');
}
