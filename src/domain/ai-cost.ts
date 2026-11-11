// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * What an AI reading costs, shown before it is asked (principle: no surprises) and counted
 * afterwards (the admin panel, Definições). Workers AI spends the account's free daily
 * Neurons; the user's own key spends money on their Gemini or Claude account.
 *
 * Catalogue prices in US dollars per million tokens, standard (not batch) rates, checked on
 * 2026-11-11. They change: when they do, change them here. Estimates, never a bill.
 */

export const FREE_NEURONS_PER_DAY = 10_000;

/** [input, output] US$ per million tokens. */
export const MODEL_PRICES: Record<string, readonly [number, number]> = {
  'gemini-3.5-flash-lite': [0.3, 2.5],
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};

export const DEFAULT_MODELS = {
  gemini: 'gemini-3.5-flash-lite',
  anthropic: 'claude-opus-5-5',
} as const;

export const MODEL_LABELS: Record<string, string> = {
  'gemini-3.5-flash-lite': 'Gemini Flash-Lite',
  'claude-opus-5-5': 'Claude Opus 5.5',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'claude-haiku-5-5': 'Claude Haiku 5.5',
};

export type CostOperation = 'receipt' | 'shelf' | 'voice' | 'date' | 'recipes' | 'test';

export interface Tokens {
  input: number;
  output: number;
}

/**
 * A typical call before there is any history to average: one receipt photo (~1600 px), a
 * spoken list, a date on a package, a handful of recipes. Measured on Claude in Nov 2026
 * (a receipt ~5 900 tokens in all, the recipes ~2 450); other models count close to it.
 */
export const TYPICAL_TOKENS: Record<CostOperation, Tokens> = {
  receipt: { input: 4_200, output: 1_700 },
  shelf: { input: 4_200, output: 1_500 },
  voice: { input: 900, output: 500 },
  date: { input: 1_800, output: 60 },
  recipes: { input: 700, output: 1_750 },
  test: { input: 200, output: 70 },
};

/** Typical Neurons on Workers AI (measured: a receipt ~40, the recipes ~14). */
export const TYPICAL_NEURONS: Record<CostOperation, number> = {
  receipt: 45,
  shelf: 45,
  voice: 10,
  date: 15,
  recipes: 15,
  test: 2,
};

/** US$ for one call, or null when the model's price is not known here. */
export function costUsd(model: string | null | undefined, tokens: Tokens): number | null {
  const price = model ? MODEL_PRICES[model] : undefined;
  if (!price) return null;
  return (tokens.input * price[0] + tokens.output * price[1]) / 1_000_000;
}

/** "0,03 US$", "0,004 US$", "menos de 0,001 US$": two significant digits are enough. */
export function formatUsd(usd: number): string {
  if (usd < 0.001) return 'menos de 0,001 US$';
  const digits = usd >= 1 ? 2 : Math.min(4, 1 - Math.floor(Math.log10(usd)));
  return `${usd.toLocaleString('pt-PT', { maximumFractionDigits: digits })} US$`;
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString('pt-PT');
}
