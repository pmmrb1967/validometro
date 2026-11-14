// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Personal data out of a text before any AI reads it (principle 7): the text of a digital
 * receipt (src/app/pdf.ts) and a spoken list. Runs on the phone and again in the Worker,
 * since an old copy of the app, or a script, may not have done it. Only text: photos cannot
 * be changed in the Worker (CLAUDE.md, free-plan limits).
 *
 * Adapted from Prazómetro (packages/ai/src/anonymize.ts), which reads letters, and tuned
 * for receipts: what is bought must survive. So prices, weights and dates are kept; an
 * address counts only at the start of a line (a product can be "QUINTA DO CRASTO"); and a
 * name only after a label ("Cliente:", "Atendido por"). In doubt, a number goes: a product
 * code the AI does not see costs nothing, a tax number sent costs privacy.
 */

export type Removed =
  'NIF' | 'TELEFONE' | 'EMAIL' | 'IBAN' | 'CARTÃO' | 'NÚMERO' | 'MORADA' | 'CÓDIGO POSTAL' | 'NOME';

export interface Anonymized {
  text: string;
  removed: Partial<Record<Removed, number>>;
}

/** Portuguese tax number: 9 digits with a check digit (modulo 11). */
export function isNif(digits: string): boolean {
  if (!/^[1235689]\d{8}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(digits[i]) * (9 - i);
  const check = 11 - (sum % 11);
  return (check >= 10 ? 0 : check) === Number(digits[8]);
}

/** Kept as they are: "2,58", "1.234,56", "1,632" (kg), 2026-11-10, 10/11/2026, 10-11-26. */
const AMOUNT = /\b\d{1,3}(?:\.\d{3})*,\d{2,3}\b|\b\d+,\d{2,3}\b/g;
const DATE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{2}[/.-]\d{2}[/.-]\d{2,4}\b/g;

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g;
/** A card shown in part: "**** 1234", "XXXXXXXXXXXX1234", "4321 **** **** 1234". */
const CARD = /(?:\b\d{4}[ -]?)?(?:[*Xx]{4}[ -]?){1,3}[*Xx]{0,4}[ -]?\d{4}\b/g;
/** Seven digits or more, maybe in groups ("912 345 678", "+351 912345678"). */
const LONG_NUMBER = /(?<![\w/])(?:\+\s?)?\d(?:[ .]?\d){6,}(?![\w/])/g;
const POSTAL =
  /\b\d{4}-\d{3}(?:[ \t]+[A-ZÀ-Ý][\p{L}'’-]*(?:[ \t]+(?:d[aeo]s?|[A-ZÀ-Ý][\p{L}'’-]*))*)?/gu;

const STREETS = [
  'Rua',
  'R\\.',
  'Avenida',
  'Av\\.',
  'Avda\\.?',
  'Travessa',
  'Tv\\.',
  'Largo',
  'Praça',
  'Praceta',
  'Estrada',
  'Estr\\.',
  'Alameda',
  'Calçada',
  'Urbanização',
  'Urb\\.',
];
/** Written as on a receipt: "Rua", "RUA". */
const bothCases = (words: string[]) => [...words, ...words.map((word) => word.toUpperCase())];
/** At the start of a line only: the shop's or the buyer's address, never a product. */
const ADDRESS = new RegExp(`^([ \\t]*)(?:${bothCases(STREETS).join('|')})(?=[ \\t]).*$`, 'gmu');

const NAME_WORD = "[A-ZÀ-Ý][\\p{L}'’-]+";
const NAME = `${NAME_WORD}(?:[ \\t]+(?:(?:d[aeo]s?|e|D[AEO]S?|E)[ \\t]+)?${NAME_WORD}){0,5}`;
/** With a colon ("Cliente: Ana Silva"), or "Atendido por Ana": never a spoken sentence. */
const NAME_LABEL = `(?:(?:${bothCases([
  'Nome',
  'Cliente',
  'Adquirente',
  'Titular',
  'Contribuinte',
  'Operador',
  'Operadora',
  'Funcionário',
  'Funcionária',
  'Vendedor',
  'Vendedora',
]).join('|')})[ \\t]*:|(?:${bothCases(['Atendido por', 'Atendida por']).join('|')})[ \\t]*:?)`;
const LABELLED_NAME = new RegExp(`(${NAME_LABEL}[ \\t]*)(${NAME})`, 'gu');
/** After "Cliente:" these are not names. */
const NOT_NAMES = /^(?:n\.?º?|nº|número|final|consumidor|cartão|contribuinte)$/i;

export function anonymize(input: string): Anonymized {
  const removed: Partial<Record<Removed, number>> = {};
  const mark = (kind: Removed) => {
    removed[kind] = (removed[kind] ?? 0) + 1;
    return `[${kind}]`;
  };

  // 1. What the reading needs, set aside.
  const kept: string[] = [];
  const keep = (match: string) => `${kept.push(match) - 1}`;
  let text = input.replace(DATE, keep).replace(AMOUNT, keep);

  // 2. Identifiers with their own shape.
  text = text
    .replace(EMAIL, () => mark('EMAIL'))
    .replace(IBAN, () => mark('IBAN'))
    .replace(CARD, () => mark('CARTÃO'))
    .replace(LONG_NUMBER, (match) => {
      const digits = match.replace(/\D/g, '').replace(/^351(?=\d{9}$)/, '');
      if (digits.length === 9 && isNif(digits)) return mark('NIF');
      if (digits.length === 9 && /^[29]/.test(digits)) return mark('TELEFONE');
      return mark('NÚMERO');
    });

  // 3. Addresses and postcodes.
  text = text
    .replace(ADDRESS, (_match, indent: string) => `${indent}${mark('MORADA')}`)
    .replace(POSTAL, () => mark('CÓDIGO POSTAL'));

  // 4. Names after a label.
  text = text.replace(LABELLED_NAME, (match, label: string, name: string) => {
    const first = name.split(/[ \t]+/)[0] ?? '';
    return NOT_NAMES.test(first) ? match : `${label}${mark('NOME')}`;
  });

  // 5. Back with what was set aside.
  text = text.replace(/(\d+)/g, (_match, index: string) => kept[Number(index)]!);
  return { text, removed };
}
