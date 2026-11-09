// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Which AI reads receipts on this device. Without accounts (until Phase 3) the user's own key
 * lives only here, in this browser, and goes with each reading request; the server uses it for
 * that call and never keeps it. With accounts it moves to D1, encrypted (AES-GCM).
 */
import { useSyncExternalStore } from 'react';

export type AiProviderChoice = 'workers-ai' | 'gemini' | 'anthropic';

export interface AiSettings {
  provider: AiProviderChoice;
  /** Kept per provider, so switching back does not lose a key. */
  keys: Partial<Record<'gemini' | 'anthropic', string>>;
  claudeModel: string;
}

export const CLAUDE_MODEL_OPTIONS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (o mais capaz)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (equilibrado)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (o mais barato)' },
] as const;

export const DEFAULT_SETTINGS: AiSettings = {
  provider: 'workers-ai',
  keys: {},
  claudeModel: 'claude-opus-5-5',
};

const STORAGE_KEY = 'validometro.ai';
const listeners = new Set<() => void>();
let cached: AiSettings | undefined;

function read(): AiSettings {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cached = raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AiSettings>) }
      : DEFAULT_SETTINGS;
  } catch {
    cached = DEFAULT_SETTINGS;
  }
  return cached;
}

export function getAiSettings(): AiSettings {
  return read();
}

export function saveAiSettings(next: AiSettings): void {
  cached = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode: kept for this visit only.
  }
  for (const listener of listeners) listener();
}

export function useAiSettings(): AiSettings {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, read);
}

/** Headers for a reading request: the chosen provider and, if it needs one, its key. */
export function aiHeaders(settings = read()): Record<string, string> {
  // Always says which: signed in, the server may hold the key for it (sealed, in the account).
  if (settings.provider === 'workers-ai') return { 'x-ai-provider': 'workers-ai' };
  const key = settings.keys[settings.provider];
  const headers: Record<string, string> = { 'x-ai-provider': settings.provider };
  if (key) headers['x-ai-key'] = key;
  if (settings.provider === 'anthropic') headers['x-ai-model'] = settings.claudeModel;
  return headers;
}
