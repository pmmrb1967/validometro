// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The first inventory, from photos of the fridge, freezer or pantry: everything seen is where
 * the photo was taken. Nothing shows when it was bought, so dates are estimated from today and
 * the review asks to confirm them; a date legible in the photo counts as printed.
 */
import { addDays, isIsoDate } from './dates';
import type { DraftItem } from './drafts';
import { frozenDays } from './freeze';
import { findRule } from './shelf-life';
import type { IsoDate, Location } from './types';

/** The estimate for a closed item in this place; in the freezer, the home-frozen one. */
function estimate(category: string | null, location: Location, today: IsoDate): IsoDate | null {
  const rule = findRule(category, location, 'fechado');
  if (location === 'congelador' && rule?.location !== 'congelador') {
    return addDays(today, frozenDays());
  }
  return rule?.days_default == null ? null : addDays(today, rule.days_default);
}

/**
 * A draft from the photo, moved to where the photo was taken. `seenDate`: the date the AI
 * read on the package (already checked as plausible), which wins over any estimate.
 */
export function placeDraft(
  draft: DraftItem,
  location: Location,
  today: IsoDate,
  seenDate: IsoDate | null,
): DraftItem {
  if (seenDate && isIsoDate(seenDate)) {
    return { ...draft, location, expires_at: seenDate, expiry_source: 'impressa' };
  }
  const expires = draft.perishable ? estimate(draft.category, location, today) : null;
  return { ...draft, location, expires_at: expires, expiry_source: expires ? 'estimada' : null };
}
