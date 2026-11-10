// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * "Começar sem conta" and "Sair": remembered on this phone, so the landing page shows to
 * someone who has not started yet, and again to whoever chose "Sair" (with or without an
 * account). Before this was kept, starting was inferred from having something registered:
 * with nothing stored, that is still the answer (landing-state.ts).
 */
import { useSyncExternalStore } from 'react';

const KEY = 'validometro.started';
const listeners = new Set<() => void>();

/** 'started' after "Começar sem conta", 'left' after "Sair", null if never chosen. */
export type StartChoice = 'started' | 'left' | null;

function read(): StartChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === '1' ? 'started' : value === '0' ? 'left' : null;
  } catch {
    return null;
  }
}

let choice = read();

function remember(next: Exclude<StartChoice, null>): void {
  try {
    localStorage.setItem(KEY, next === 'started' ? '1' : '0');
  } catch {
    // Private mode: it lasts for this visit.
  }
  choice = next;
  for (const listener of listeners) listener();
}

export function markStarted(): void {
  remember('started');
}

/** "Sair" (signing out, or leaving without an account): back to the landing page. */
export function forgetStarted(): void {
  remember('left');
}

export function useStartChoice(): StartChoice {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => choice,
  );
}

export function useStarted(): boolean {
  return useStartChoice() === 'started';
}
