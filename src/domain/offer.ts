// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * "Oferecer": before something goes to the bin, a message to give it to family, friends or
 * neighbours, sent through whatever the phone already uses (WhatsApp, SMS…). No network of
 * our own: the text goes to the phone's share sheet and nothing else leaves the app.
 */
import { effectiveKind } from './date-kind';
import { AMBER_MAX_DAYS } from './traffic-light';
import type { Item } from './types';

function when(daysLeft: number): string {
  if (daysLeft < 0) return 'passou da data de preferência, mas costuma estar bom';
  if (daysLeft === 0) return 'a validade acaba hoje';
  if (daysLeft === 1) return 'a validade acaba amanhã';
  return `a validade acaba daqui a ${daysLeft} dias`;
}

/** Worth offering: its last week, and never past a "consumir até" date. */
export function canOffer(
  item: Pick<Item, 'category' | 'opened_at' | 'expiry_kind'>,
  daysLeft: number | null,
): boolean {
  if (daysLeft === null || daysLeft > AMBER_MAX_DAYS) return false;
  return daysLeft >= 0 || effectiveKind(item) === 'consumir_de_preferencia';
}

/** "Tenho Iogurtes naturais: a validade acaba amanhã e não vou conseguir usar a tempo…" */
export function offerText(item: Pick<Item, 'name' | 'opened_at'>, daysLeft: number): string {
  const opened = item.opened_at ? ' (já aberto)' : '';
  return `Tenho ${item.name}${opened}: ${when(daysLeft)} e não vou conseguir usar a tempo. Queres? É só passares por cá.`;
}
