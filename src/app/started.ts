// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * "Começar sem conta": remembered on this phone, so the landing page shows only to someone
 * who has not started yet (no account, nothing registered, never chose to start).
 */
import { useSyncExternalStore } from 'react';

const KEY = 'validometro.started';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let started = read();

export function markStarted(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Private mode: it lasts for this visit.
  }
  started = true;
  for (const listener of listeners) listener();
}

/** After signing out: back to the landing page, as someone new on this phone. */
export function forgetStarted(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Private mode: nothing was kept.
  }
  started = false;
  for (const listener of listeners) listener();
}

export function useStarted(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => started,
  );
}
