// SPDX-License-Identifier: AGPL-3.0-or-later
import { daysBetween } from './dates';
import { isLongLife } from './shelf-life';
import type { IsoDate, Item } from './types';

/** red: expires in ≤ 2 days or already expired; amber: ≤ 7 days; green: the rest. */
export type Light = 'red' | 'amber' | 'green';

export const RED_MAX_DAYS = 2;
export const AMBER_MAX_DAYS = 7;

export function lightFor(daysLeft: number): Light {
  if (daysLeft <= RED_MAX_DAYS) return 'red';
  if (daysLeft <= AMBER_MAX_DAYS) return 'amber';
  return 'green';
}

export interface LitItem {
  item: Item;
  /** Null for long-life items without a date. */
  daysLeft: number | null;
  light: Light | null;
  longLife: boolean;
  /**
   * No date and not a long-life kind (an unknown product, no rule): it may well spoil, so it
   * is shown apart ("Sem data, confirma") until it gets a kind or a date. Also longLife.
   */
  undated: boolean;
}

export function light(item: Item, today: IsoDate): LitItem {
  const daysLeft = item.expires_at ? daysBetween(today, item.expires_at) : null;
  return {
    item,
    daysLeft,
    light: daysLeft === null ? null : lightFor(daysLeft),
    longLife: daysLeft === null || isLongLife(item.category),
    undated: daysLeft === null && !isLongLife(item.category),
  };
}

/** "Expirou há 2 dias", "Expira hoje", "Expira amanhã", "Faltam 5 dias". */
export function daysLabel(daysLeft: number | null): string {
  if (daysLeft === null) return 'Sem data';
  if (daysLeft < -1) return `Expirou há ${-daysLeft} dias`;
  if (daysLeft === -1) return 'Expirou ontem';
  if (daysLeft === 0) return 'Expira hoje';
  if (daysLeft === 1) return 'Expira amanhã';
  return `Faltam ${daysLeft} dias`;
}

/** Soonest first; items without a date last, by name. */
export function bySoonest(a: LitItem, b: LitItem): number {
  if (a.daysLeft === null || b.daysLeft === null) {
    if (a.daysLeft !== b.daysLeft) return a.daysLeft === null ? 1 : -1;
  } else if (a.daysLeft !== b.daysLeft) {
    return a.daysLeft - b.daysLeft;
  }
  return a.item.name.localeCompare(b.item.name, 'pt');
}
