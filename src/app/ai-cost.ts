// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The note beside each AI button: about how much this reading spends, before it is asked.
 * The free AI counts the account's daily Neurons; the user's own key, US dollars. Averages of
 * the last 30 days come from the server (GET /api/ai/estimate); until there are some, the
 * typical values in src/domain/ai-cost.ts.
 */
import { useEffect, useState } from 'react';
import {
  costUsd,
  DEFAULT_MODELS,
  formatCount,
  formatUsd,
  MODEL_LABELS,
  TYPICAL_NEURONS,
  TYPICAL_TOKENS,
  type CostOperation,
} from '../domain/ai-cost';
import { useAiSettings, type AiSettings } from './ai-settings';

export interface Estimate {
  neuronsToday: number;
  neuronsLimit: number;
  neurons: { operation: string; neurons: number }[];
  tokens: { model: string; operation: string; input: number; output: number }[];
}

const FRESH_MS = 60_000;
let cached: { at: number; value: Estimate } | undefined;
let pending: Promise<Estimate | undefined> | undefined;
const listeners = new Set<(value: Estimate) => void>();

async function load(): Promise<Estimate | undefined> {
  try {
    const res = await fetch('/api/ai/estimate');
    if (!res.ok) return undefined;
    const value = (await res.json()) as Estimate;
    cached = { at: Date.now(), value };
    for (const listener of listeners) listener(value);
    return value;
  } catch {
    return undefined;
  } finally {
    pending = undefined;
  }
}

/** After a reading: today's Neurons changed. */
export function refreshEstimate(): void {
  cached = undefined;
  if (listeners.size) pending ??= load();
}

function useEstimate(): Estimate | undefined {
  const [value, setValue] = useState(cached?.value);
  useEffect(() => {
    listeners.add(setValue);
    if (!cached || Date.now() - cached.at > FRESH_MS) pending ??= load();
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

/** Photos raise the input (each one is read); the answer stays about the same. */
function scaled(input: number, output: number, photos: number) {
  return { input: input * Math.max(1, photos), output };
}

/** What one estimate is for. */
const PER: Record<CostOperation, string> = {
  receipt: 'por talão',
  shelf: 'por foto',
  voice: 'por lista',
  date: 'por data',
  recipes: 'por pedido',
  test: 'no teste',
};

/** The sentence for this operation, or null when there is nothing to say (no key yet). */
export function costNote(
  settings: AiSettings,
  estimate: Estimate | undefined,
  operation: CostOperation,
  photos = 1,
): string | null {
  const per = photos > 1 ? `pelas ${photos} fotos` : PER[operation];
  if (settings.provider === 'workers-ai') {
    const average = estimate?.neurons.find((row) => row.operation === operation)?.neurons;
    const neurons = Math.max(1, (average ?? TYPICAL_NEURONS[operation]) * Math.max(1, photos));
    const head = `IA gratuita: ≈ ${formatCount(neurons)} neurons ${per}`;
    if (!estimate) return `${head}.`;
    const left = Math.max(0, estimate.neuronsLimit - estimate.neuronsToday);
    return `${head}; hoje restam ${formatCount(left)} de ${formatCount(estimate.neuronsLimit)}.`;
  }
  const model =
    settings.provider === 'anthropic' ? settings.claudeModel : DEFAULT_MODELS[settings.provider];
  const seen = estimate?.tokens.find((row) => row.model === model && row.operation === operation);
  const base = seen ?? TYPICAL_TOKENS[operation];
  const usd = costUsd(model, scaled(base.input, base.output, photos));
  if (usd === null) return null;
  return `Na tua chave (${MODEL_LABELS[model] ?? model}): ≈ ${formatUsd(usd)} ${per}.`;
}

export function useCostNote(operation: CostOperation, photos = 1): string | null {
  const settings = useAiSettings();
  const estimate = useEstimate();
  return costNote(settings, estimate, operation, photos);
}
