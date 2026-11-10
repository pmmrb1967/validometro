// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Moving an item between the fridge, freezer and pantry (the beer into the fridge, ripe fruit
 * out of the pantry). A printed or typed date stays: it holds wherever the package is
 * (principle 5). An estimate is redone with the rule of the new place, from the day it was
 * bought (or opened). Into the freezer is "Congelei"; out of it, a short date from today.
 */
import { addDays, lisbonDate } from './dates';
import { FREEZABLE, freezeItem } from './freeze';
import { findRule, isLongLife } from './shelf-life';
import type { IsoDate, Item, Location } from './types';

export type MoveChanges = Pick<
  Item,
  'location' | 'expires_at' | 'expiry_source' | 'expiry_kind' | 'opened_at'
>;

/** A rule written for that very place (findRule falls back to other places). */
function daysIn(category: string | null, location: Location, state: 'fechado' | 'aberto') {
  const rule = findRule(category, location, state);
  return rule?.location === location && rule.state === state ? rule.days_default : undefined;
}

function earlier(a: IsoDate | null, b: IsoDate | null): IsoDate | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

export function moveItem(item: Item, to: Location, today: IsoDate): MoveChanges {
  const same: MoveChanges = {
    location: to,
    expires_at: item.expires_at,
    expiry_source: item.expiry_source,
    expiry_kind: item.expiry_kind ?? null,
    opened_at: item.opened_at,
  };
  if (to === item.location) return same;
  if (to === 'congelador') {
    // Bought frozen (its own freezer rule) with a printed date: that date holds.
    const boughtFrozen =
      item.expiry_source !== 'estimada' && daysIn(item.category, 'congelador', 'fechado') != null;
    return isLongLife(item.category) || boughtFrozen ? same : freezeItem(today);
  }

  if (item.location === 'congelador') {
    // Thawed: counts from today, as opened if there is such a rule; never later than before.
    const days = daysIn(item.category, to, 'aberto') ?? daysIn(item.category, to, 'fechado');
    if (days == null) return same;
    const estimate = addDays(today, days);
    const kept = item.expiry_source === 'estimada' ? null : item.expires_at;
    const expires = earlier(kept, estimate);
    return {
      ...same,
      opened_at: item.opened_at ?? `${today}T12:00:00.000Z`,
      expires_at: expires,
      expiry_source: expires === kept ? item.expiry_source : 'estimada',
    };
  }

  if (item.expiry_source !== 'estimada') return same;
  const state = item.opened_at ? 'aberto' : 'fechado';
  const days = daysIn(item.category, to, state);
  if (days == null) return same;
  const from = lisbonDate(new Date(item.opened_at ?? item.purchased_at ?? item.created_at));
  return { ...same, expires_at: addDays(from, days) };
}

/** Into the freezer something that does not freeze well: say so (but let it be). */
export function freezesBadly(item: Pick<Item, 'category'>): boolean {
  return (
    !!item.category &&
    !FREEZABLE.has(item.category) &&
    !isLongLife(item.category) &&
    daysIn(item.category, 'congelador', 'fechado') == null
  );
}
