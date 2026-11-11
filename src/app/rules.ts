// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * This household's own shelf-life days ("Regras de validade"). Without an account they live
 * only on this phone; with one, in the household (D1), so everyone at home estimates the
 * same, and every sync brings the latest (sync.ts). The phone's copy sits in IndexedDB
 * (meta 'rules'), so the estimates work offline.
 */
import { useSyncExternalStore } from 'react';
import { setRuleOverrides, type RuleOverride, ruleKey } from '../domain/shelf-life';
import { call, currentUser } from './account';
import { db, type InventoryDb } from './store/items';

const META_KEY = 'rules';

let current: readonly RuleOverride[] = [];
const listeners = new Set<() => void>();

function apply(next: readonly RuleOverride[]): void {
  current = [...next].sort((a, b) => ruleKey(a).localeCompare(ruleKey(b)));
  setRuleOverrides(current);
  for (const listener of listeners) listener();
}

async function store(next: readonly RuleOverride[], local: InventoryDb = db): Promise<void> {
  await local.meta.put({ key: META_KEY, value: JSON.stringify(next) });
  apply(next);
}

/** At start-up: the copy on this phone. */
export async function loadRules(local: InventoryDb = db): Promise<void> {
  try {
    const saved = (await local.meta.get(META_KEY))?.value;
    apply(typeof saved === 'string' ? (JSON.parse(saved) as RuleOverride[]) : []);
  } catch {
    apply([]);
  }
}

export function getOverrides(): readonly RuleOverride[] {
  return current;
}

export function useOverrides(): readonly RuleOverride[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

/** The copy was cleared (sign-out, another household): back to the defaults. */
export function forgetRules(): void {
  apply([]);
}

/** What the household has, from a sync: it replaces this copy. */
export async function receiveRules(
  overrides: readonly RuleOverride[],
  local: InventoryDb = db,
): Promise<void> {
  const same =
    overrides.length === current.length &&
    overrides.every((rule) =>
      current.some((mine) => ruleKey(mine) === ruleKey(rule) && mine.days === rule.days),
    );
  if (!same) await store(overrides, local);
}

/**
 * First sync of this phone with an account, and the household has no days of its own: the
 * ones set here before there was an account go to it.
 */
export async function handOverRules(): Promise<void> {
  for (const rule of current) await call('PUT', '/api/household/rules', rule);
}

/** One rule: a number of days, or null to go back to the default. */
export async function saveRule(
  rule: Omit<RuleOverride, 'days'>,
  days: number | null,
  local: InventoryDb = db,
): Promise<void> {
  if (currentUser()) await call('PUT', '/api/household/rules', { ...rule, days });
  const others = current.filter((mine) => ruleKey(mine) !== ruleKey(rule));
  await store(days === null ? others : [...others, { ...rule, days }], local);
}
