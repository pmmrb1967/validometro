// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DraftItem } from '../domain/drafts';
import type { Location } from '../domain/types';
import { aiHeaders } from './ai-settings';
import { refreshEstimate } from './ai-cost';

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
  // Spent or not, today's Neurons may have moved: the cost notes ask again.
  refreshEstimate();
  if (!res.ok) throw new ApiError(await errorMessage(res, fallback));
  return (await res.json()) as T;
}

/** As many parts of one long receipt as the server takes (src/worker/ingest.ts). */
export const MAX_RECEIPT_PARTS = 4;

/** One photo, or the parts of a long receipt (top to bottom), read as one receipt. */
export function readReceipt(images: string | string[]): Promise<ReadingResult> {
  const parts = typeof images === 'string' ? [images] : images;
  const body = parts.length === 1 ? { image: parts[0] } : { images: parts };
  return postJson('/api/ingest/receipt', body, 'Não foi possível ler o talão.');
}

/** A digital receipt (PDF) read as text on the phone: no image to send. */
export function readReceiptText(text: string): Promise<ReadingResult> {
  return postJson('/api/ingest/receipt', { text }, 'Não foi possível ler o talão.');
}

/** The first inventory: photos of one place, read as what is in it. */
export function readShelf(images: string[], location: Location): Promise<ReadingResult> {
  return postJson('/api/ingest/shelf', { images, location }, 'Não foi possível ler as fotos.');
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

/** "O que cozinhar hoje?": what is about to go off, never stored. */
export function suggestRecipes(
  items: { name: string; days: number }[],
): Promise<{ recipes: Recipe[] }> {
  return postJson('/api/ai/recipes', { items }, 'Não foi possível pensar em receitas.');
}
