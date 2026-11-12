// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The item, in the same shape as the D1 `items` table (migrations/0001_init.sql), so the local
 * inventory (IndexedDB) can move to D1 unchanged once there are accounts (Phase 3).
 */

export const LOCATIONS = ['frigorifico', 'congelador', 'despensa'] as const;
export type Location = (typeof LOCATIONS)[number];

export type OpenState = 'fechado' | 'aberto';
/** 'apagado': registado por engano (twice, or never bought). Not eaten nor thrown away. */
export type ItemStatus = 'ativo' | 'consumido' | 'deitado_fora' | 'apagado';
export type ExpirySource = 'impressa' | 'estimada' | 'manual';
/** What the package says before the date: safety ("até") or quality ("de preferência"). */
export const EXPIRY_KINDS = ['consumir_ate', 'consumir_de_preferencia'] as const;
export type ExpiryKind = (typeof EXPIRY_KINDS)[number];

/** A calendar date, `YYYY-MM-DD` (ISO 8601). Expiry is a day, not an instant. */
export type IsoDate = string;
/** An instant, ISO 8601 in UTC (`2026-11-09T18:00:00.000Z`). */
export type IsoInstant = string;

export interface Item {
  id: string;
  household_id: string;
  created_by: string | null;
  name: string;
  category: string | null;
  location: Location;
  ean: string | null;
  /** Optional, always (CLAUDE.md, principle 2). */
  quantity: number | null;
  unit: string | null;
  purchased_at: IsoInstant | null;
  opened_at: IsoInstant | null;
  /** Null when there is no date and no rule: a long-life item, out of the traffic light. */
  expires_at: IsoDate | null;
  expiry_source: ExpirySource | null;
  /** Null when unknown: the category's usual kind applies (date-kind.ts). */
  expiry_kind?: ExpiryKind | null;
  /** What it cost, in euros (the receipt's line, or typed). Optional, like quantity. */
  price?: number | null;
  /** The receipt it came from (receipts.id): its price is in that receipt's total. */
  receipt_id?: string | null;
  status: ItemStatus;
  resolved_at: IsoInstant | null;
  created_at: IsoInstant;
  /** Last change on the phone that made it: the newer change wins when syncing. */
  updated_at?: IsoInstant;
}

export const LOCATION_LABELS: Record<Location, string> = {
  frigorifico: 'Frigorífico',
  congelador: 'Congelador',
  despensa: 'Despensa',
};

/** "no frigorífico", "no congelador", "na despensa". */
export const IN_LOCATION: Record<Location, string> = {
  frigorifico: 'no frigorífico',
  congelador: 'no congelador',
  despensa: 'na despensa',
};
