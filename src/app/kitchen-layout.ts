// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * How this family's fridge and freezer are (Definições → "A tua cozinha"), and whether the
 * food screen shows the list or the drawn kitchen. Only looks: kept on this phone.
 */
import { useSyncExternalStore } from 'react';
import { KITCHEN_LAYOUTS, type KitchenLayout } from '../domain/kitchen';

export type FoodView = 'lista' | 'cozinha';

const LAYOUT_KEY = 'validometro.kitchen';
const VIEW_KEY = 'validometro.view';
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: kept for this visit only.
  }
  memory.set(key, value);
  for (const listener of listeners) listener();
}

const memory = new Map<string, string>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useKitchenLayout(): KitchenLayout {
  return useSyncExternalStore(subscribe, () => {
    const value = memory.get(LAYOUT_KEY) ?? read(LAYOUT_KEY);
    return (KITCHEN_LAYOUTS as readonly string[]).includes(value ?? '')
      ? (value as KitchenLayout)
      : 'combinado-baixo';
  });
}

export const setKitchenLayout = (layout: KitchenLayout) => write(LAYOUT_KEY, layout);

export function useFoodView(): FoodView {
  return useSyncExternalStore(subscribe, () =>
    (memory.get(VIEW_KEY) ?? read(VIEW_KEY)) === 'cozinha' ? 'cozinha' : 'lista',
  );
}

export const setFoodView = (view: FoodView) => write(VIEW_KEY, view);
