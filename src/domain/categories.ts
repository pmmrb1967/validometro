// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/** Categories (the shelf-life rules' keys), and guessing one from a name or Open Food Facts. */
import { SHELF_LIFE_RULES } from './shelf-life';
import type { Location } from './types';

export interface Category {
  id: string;
  label: string;
  /** Where it usually lives when it comes home (closed). */
  defaultLocation: Location;
}

/**
 * One entry per rule category, in the order of the rules table. The default place is the first
 * closed rule's (where it is kept before opening: UHT milk in the pantry, fruit in the pantry).
 */
export const CATEGORIES: readonly Category[] = [
  ...new Set(SHELF_LIFE_RULES.map((rule) => rule.category)),
].map((id) => {
  const rules = SHELF_LIFE_RULES.filter((rule) => rule.category === id);
  const home = rules.find((rule) => rule.state === 'fechado') ?? rules[0]!;
  return { id, label: rules[0]!.label, defaultLocation: home.location };
});

export function categoryById(id: string | null): Category | undefined {
  return CATEGORIES.find((category) => category.id === id);
}

/** Lower case, no accents: "Pão" and "pao" match. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Keywords (already normalized) by category. Longest match wins: "queijo fresco" over "queijo". */
const KEYWORDS: Record<string, readonly string[]> = {
  carne_picada: ['carne picada', 'picada', 'hamburguer', 'hamburgueres'],
  carne_fresca: [
    'bife',
    'bifes',
    'frango',
    'peru',
    'porco',
    'vaca',
    'novilho',
    'vitela',
    'costeleta',
    'costeletas',
    'entrecosto',
    'lombo',
    'febras',
    'coxas',
    'perna de',
    'peito de frango',
    'carne',
    'borrego',
    'salsichas frescas',
  ],
  peixe_fresco: [
    'peixe',
    'salmao',
    'pescada',
    'dourada',
    'robalo',
    'sardinha',
    'sardinhas',
    'carapau',
    'bacalhau fresco',
    'polvo',
    'lulas',
    'camarao',
    'marisco',
    'atum fresco',
  ],
  charcutaria_fatiada: [
    'fiambre',
    'presunto',
    'chourico',
    'salame',
    'mortadela',
    'paio',
    'bacon',
    'peito de peru',
    'charcutaria',
  ],
  queijo_fresco: ['queijo fresco', 'requeijao', 'mozzarella', 'mozarela', 'burrata', 'ricota'],
  queijo_curado: ['queijo', 'parmesao', 'flamengo', 'serra', 'cheddar', 'emmental'],
  leite_uht: ['leite', 'leite uht', 'leite meio gordo', 'leite magro', 'bebida vegetal'],
  leite_fresco: ['leite fresco', 'leite do dia', 'leite pasteurizado'],
  iogurtes: ['iogurte', 'iogurtes', 'skyr', 'kefir', 'danone', 'actimel'],
  natas: ['natas', 'nata'],
  ovos: ['ovos', 'ovo'],
  pao_fresco: ['pao', 'broa', 'baguete', 'papo-seco', 'papo seco', 'carcaca', 'bolo', 'croissant'],
  fruta: [
    'fruta',
    'maca',
    'macas',
    'banana',
    'bananas',
    'pera',
    'peras',
    'laranja',
    'laranjas',
    'tangerina',
    'clementina',
    'morango',
    'morangos',
    'uvas',
    'kiwi',
    'kiwis',
    'ananas',
    'melao',
    'melancia',
    'pessego',
    'ameixa',
    'cereja',
    'cerejas',
    'mirtilo',
    'framboesa',
    'abacate',
    'manga',
    'limao',
    'limoes',
    'figo',
    'figos',
    'diospiro',
  ],
  legumes: [
    'legumes',
    'tomate',
    'tomates',
    'cenoura',
    'cenouras',
    'courgette',
    'curgete',
    'brocolos',
    'couve',
    'espinafres',
    'pimento',
    'pimentos',
    'pepino',
    'beringela',
    'cogumelos',
    'feijao verde',
    'abobora',
    'alho frances',
    'nabo',
    'grelos',
  ],
  saladas_embaladas: [
    'salada',
    'saladas',
    'alface',
    'rucula',
    'agriao',
    'canonigos',
    'espinafre baby',
  ],
  sobras: ['sobras', 'restos', 'comida feita'],
  congelados: [
    'congelado',
    'congelados',
    'gelado',
    'gelados',
    'ervilhas congeladas',
    'douradinhos',
  ],
  molhos_frascos: [
    'molho',
    'ketchup',
    'maionese',
    'mostarda',
    'pesto',
    'compota',
    'doce de',
    'pickles',
    'azeitonas',
    'frasco',
  ],
  longa_duracao: [
    'massa',
    'esparguete',
    'arroz',
    'atum',
    'feijao',
    'grao',
    'lentilhas',
    'enlatado',
    'conserva',
    'azeite',
    'oleo',
    'farinha',
    'acucar',
    'sal',
    'cafe',
    'cha',
    'cereais',
    'bolachas',
    'lata',
  ],
};

const KEYWORD_INDEX: readonly [string, string][] = Object.entries(KEYWORDS)
  .flatMap(([category, words]) => words.map((word): [string, string] => [word, category]))
  .sort(([a], [b]) => b.length - a.length);

/** Best guess from a product name, matching whole words; undefined when nothing fits. */
export function suggestCategory(name: string): string | undefined {
  const text = ` ${normalize(name).replace(/[^\p{L}\p{N}-]+/gu, ' ')} `;
  for (const [word, category] of KEYWORD_INDEX) {
    if (text.includes(` ${word} `)) return category;
  }
  return undefined;
}

/**
 * Open Food Facts category tags (`en:yogurts`…) to ours. More specific tags first: frozen and
 * canned before fish, fresh cheese before cheese.
 */
const OFF_TAGS: readonly [string, string][] = [
  ['en:frozen-foods', 'congelados'],
  ['en:canned-foods', 'longa_duracao'],
  ['en:minced-meats', 'carne_picada'],
  ['en:minced-meat', 'carne_picada'],
  ['en:yogurts', 'iogurtes'],
  ['en:fermented-milk-products', 'iogurtes'],
  ['en:fresh-milks', 'leite_fresco'],
  ['en:pasteurized-milks', 'leite_fresco'],
  ['en:uht-milks', 'leite_uht'],
  ['en:milks', 'leite_uht'],
  ['en:plant-based-milk-alternatives', 'leite_uht'],
  ['en:creams', 'natas'],
  ['en:eggs', 'ovos'],
  ['en:fresh-cheeses', 'queijo_fresco'],
  ['en:mozzarella', 'queijo_fresco'],
  ['en:cheeses', 'queijo_curado'],
  ['en:hams', 'charcutaria_fatiada'],
  ['en:sausages', 'charcutaria_fatiada'],
  ['en:prepared-meats', 'charcutaria_fatiada'],
  ['en:fishes', 'peixe_fresco'],
  ['en:seafood', 'peixe_fresco'],
  ['en:poultries', 'carne_fresca'],
  ['en:meats', 'carne_fresca'],
  ['en:breads', 'pao_fresco'],
  ['en:salads', 'saladas_embaladas'],
  ['en:fruits', 'fruta'],
  ['en:vegetables', 'legumes'],
  ['en:sauces', 'molhos_frascos'],
  ['en:condiments', 'molhos_frascos'],
  ['en:spreads', 'molhos_frascos'],
  ['en:jams', 'molhos_frascos'],
  ['en:pastas', 'longa_duracao'],
  ['en:rices', 'longa_duracao'],
  ['en:legumes', 'longa_duracao'],
  ['en:breakfast-cereals', 'longa_duracao'],
  ['en:biscuits', 'longa_duracao'],
  ['en:coffees', 'longa_duracao'],
  ['en:teas', 'longa_duracao'],
  ['en:oils', 'longa_duracao'],
  ['en:sugars', 'longa_duracao'],
  ['en:flours', 'longa_duracao'],
  ['en:beverages', 'longa_duracao'],
];

export function categoryFromOffTags(tags: readonly string[]): string | undefined {
  for (const [tag, category] of OFF_TAGS) {
    if (tags.includes(tag)) return category;
  }
  return undefined;
}
