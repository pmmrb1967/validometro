// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * A household changed a rule ("o nosso leite fresco dura 3 dias"): the items whose date was
 * estimated with it move by the difference. A printed or typed date never moves (principle
 * 5). Shifting, rather than counting again from the purchase, keeps the right start for what
 * was frozen or opened later.
 */
import { addDays } from './dates';
import { FREEZABLE } from './freeze';
import { findRule, ruleKey } from './shelf-life';
import type { IsoDate, Item } from './types';

/** The rule an item's estimate came from: frozen at home counts as "congelado em casa". */
export function governingRuleKey(
  item: Pick<Item, 'category' | 'location' | 'opened_at'>,
): string | undefined {
  const state = item.opened_at ? 'aberto' : 'fechado';
  if (item.location === 'congelador' && item.category && FREEZABLE.has(item.category)) {
    return ruleKey({ category: 'congelado_em_casa', location: 'congelador', state });
  }
  const rule = findRule(item.category, item.location, state);
  return rule ? ruleKey(rule) : undefined;
}

/** Active items with an estimated date from this rule. */
export function estimatedUnder<T extends Item>(items: readonly T[], key: string): T[] {
  return items.filter(
    (item) =>
      item.status === 'ativo' &&
      item.expiry_source === 'estimada' &&
      item.expires_at !== null &&
      governingRuleKey(item) === key,
  );
}

export function shifted(expires: IsoDate, fromDays: number, toDays: number): IsoDate {
  return addDays(expires, toDays - fromDays);
}
