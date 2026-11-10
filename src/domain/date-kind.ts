// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * "Consumir até" is about safety: after it, the food goes. "Consumir de preferência antes de"
 * is about quality: after it, the food is usually still good, so the app says "olha, cheira,
 * prova" instead of sounding the alarm. Mixing them up is the main reason good food is thrown
 * away (Too Good To Go, Portugal).
 *
 * The package says which one it is (the date photo reads it, or the user picks it); when it is
 * not known, the category's usual kind applies.
 */
import type { ExpiryKind, Item } from './types';

export const EXPIRY_KIND_LABELS: Record<ExpiryKind, string> = {
  consumir_ate: 'Consumir até',
  consumir_de_preferencia: 'Consumir de preferência antes de',
};

/** Perishable enough that the date is a limit (the label says "consumir até"). */
const USE_BY = new Set([
  'carne_picada',
  'carne_fresca',
  'peixe_fresco',
  'charcutaria_fatiada',
  'queijo_fresco',
  'leite_fresco',
  'saladas_embaladas',
  'sobras',
]);

/** Usually "de preferência", and what to expect after the date. */
const BEST_BEFORE: Record<string, string> = {
  leite_uht: 'Fechado, o leite UHT costuma aguentar semanas depois desta data.',
  queijo_curado: 'O queijo curado costuma aguentar bem mais umas semanas.',
  iogurtes: 'Fechados e no frio, os iogurtes costumam estar bons mais uns dias.',
  ovos: 'Ainda servem uns dias depois, bem cozinhados (não para receitas com ovo cru).',
  pao_fresco: 'Se não tiver bolor, serve para torradas, açorda ou pão ralado.',
  congelados: 'Sempre congelado, continua seguro: só perde qualidade com o tempo.',
  molhos_frascos: 'Fechado, costuma aguentar semanas.',
  longa_duracao: 'Costuma aguentar meses depois desta data.',
  bebidas: 'Fechada, costuma aguentar meses depois desta data.',
  doces_snacks: 'Fechado, costuma aguentar semanas ou meses depois desta data (pode perder sabor).',
};

/** The category's usual kind; null when it varies (fruit, vegetables, other). */
export function defaultKind(category: string | null): ExpiryKind | null {
  if (!category) return null;
  if (USE_BY.has(category)) return 'consumir_ate';
  if (category in BEST_BEFORE) return 'consumir_de_preferencia';
  return null;
}

type KindFields = Pick<Item, 'category' | 'opened_at'> & Partial<Pick<Item, 'expiry_kind'>>;

/**
 * The kind that counts now. Once open, the package's date no longer applies: the opened
 * estimate is a limit, whatever the label said.
 */
export function effectiveKind(item: KindFields): ExpiryKind | null {
  if (item.opened_at) return 'consumir_ate';
  return item.expiry_kind ?? defaultKind(item.category);
}

/** Past a "de preferência" date: still worth a look, not the bin. */
export function pastBestBefore(item: KindFields, daysLeft: number | null): boolean {
  return daysLeft !== null && daysLeft < 0 && effectiveKind(item) === 'consumir_de_preferencia';
}

/** "Passou há 3 dias": short, for the card; the advice below it says it was a quality date. */
export function bestBeforeLabel(daysLeft: number): string {
  if (daysLeft === -1) return 'Passou ontem';
  return `Passou há ${-daysLeft} dias`;
}

/**
 * What to say once the date has passed: look, smell and taste for "de preferência"; do not
 * risk it for "consumir até". Null before the date, or when the kind is not known.
 */
export function afterDateAdvice(item: KindFields, daysLeft: number | null): string | null {
  if (daysLeft === null || daysLeft >= 0) return null;
  const kind = effectiveKind(item);
  if (kind === 'consumir_de_preferencia') {
    const usual = (item.category && BEST_BEFORE[item.category]) || 'Normalmente ainda está bom.';
    return `Era data de preferência: olha, cheira, prova. ${usual}`;
  }
  if (kind === 'consumir_ate') return 'Era “consumir até”: depois da data, não arrisques.';
  return null;
}

/** The date photo's answer, as stored ("desconhecido" is null). */
export function kindFromReading(kind: string | null | undefined): ExpiryKind | null {
  return kind === 'consumir_ate' || kind === 'consumir_de_preferencia' ? kind : null;
}
