// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The drawn kitchen (Alimentos → "Cozinha"): where each item sits in the fridge, freezer and
 * pantry. Not where it really is: where it is easiest to see. The shelves follow the traffic
 * light (what to use first at eye level, on the top shelf); the door, the drawer and the
 * bottom of the pantry take what usually lives there.
 */
import type { LitItem } from './traffic-light';

/** How the family's fridge and freezer are, so the drawing looks like theirs. */
export const KITCHEN_LAYOUTS = [
  'combinado-baixo',
  'combinado-cima',
  'americano',
  'separados',
  'so-frigorifico',
] as const;
export type KitchenLayout = (typeof KITCHEN_LAYOUTS)[number];

export const KITCHEN_LAYOUT_LABELS: Record<KitchenLayout, { label: string; hint: string }> = {
  'combinado-baixo': {
    label: 'Combinado, congelador em baixo',
    hint: 'O mais comum: frigorífico em cima, gavetas do congelador em baixo.',
  },
  'combinado-cima': {
    label: 'Combinado, congelador em cima',
    hint: 'Uma porta pequena de congelador por cima do frigorífico.',
  },
  americano: {
    label: 'Americano (lado a lado)',
    hint: 'Duas portas altas: congelador à esquerda, frigorífico à direita.',
  },
  separados: {
    label: 'Frigorífico e arca separados',
    hint: 'Um frigorífico e uma arca congeladora noutro sítio (garagem, despensa).',
  },
  'so-frigorifico': {
    label: 'Só frigorífico',
    hint: 'Sem congelador (ou só um compartimento pequeno).',
  },
};

/** One drawn icon per kind of food (components/FoodIcon.tsx). */
export type FoodIcon =
  | 'bottle'
  | 'carton'
  | 'egg'
  | 'meat'
  | 'fish'
  | 'cheese'
  | 'cup'
  | 'leaf'
  | 'apple'
  | 'bread'
  | 'jar'
  | 'box'
  | 'frozen'
  | 'sweet'
  | 'food';

const ICONS: Record<string, FoodIcon> = {
  carne_picada: 'meat',
  carne_fresca: 'meat',
  charcutaria_fatiada: 'meat',
  peixe_fresco: 'fish',
  queijo_fresco: 'cheese',
  queijo_curado: 'cheese',
  leite_fresco: 'bottle',
  leite_uht: 'carton',
  bebidas: 'bottle',
  iogurtes: 'cup',
  natas: 'cup',
  ovos: 'egg',
  pao_fresco: 'bread',
  fruta: 'apple',
  legumes: 'leaf',
  saladas_embaladas: 'leaf',
  sobras: 'box',
  molhos_frascos: 'jar',
  congelados: 'frozen',
  congelado_em_casa: 'frozen',
  longa_duracao: 'box',
  doces_snacks: 'sweet',
};

export function iconFor(category: string | null): FoodIcon {
  return (category && ICONS[category]) || 'food';
}

/** What lives in the fridge door, and in the bottom drawer. */
const DOOR = new Set(['bebidas', 'leite_fresco', 'leite_uht', 'molhos_frascos', 'ovos', 'natas']);
const DRAWER = new Set(['legumes', 'fruta', 'saladas_embaladas']);

export interface Kitchen {
  fridge: { shelves: [LitItem[], LitItem[], LitItem[]]; door: LitItem[]; drawer: LitItem[] };
  freezer: { drawers: LitItem[][] };
  pantry: { shelves: LitItem[][] };
}

/** Top shelf "usar já", the middle one "esta semana", the bottom one the rest. */
function shelfOf(entry: LitItem): 0 | 1 | 2 {
  if (entry.light === 'red') return 0;
  if (entry.light === 'amber') return 1;
  return 2;
}

/** In order, cut into `count` drawers or shelves as even as can be (at least one). */
function split<T>(list: readonly T[], count: number): T[][] {
  const per = Math.max(1, Math.ceil(list.length / count));
  return Array.from({ length: count }, (_, index) => list.slice(index * per, (index + 1) * per));
}

/** `entries` already sorted, soonest first (traffic-light.ts bySoonest). */
export function arrangeKitchen(entries: readonly LitItem[]): Kitchen {
  const kitchen: Kitchen = {
    fridge: { shelves: [[], [], []], door: [], drawer: [] },
    freezer: { drawers: [] },
    pantry: { shelves: [] },
  };
  const frozen: LitItem[] = [];
  const pantryFresh: LitItem[] = [];
  const pantryLong: LitItem[] = [];
  for (const entry of entries) {
    const { location, category } = entry.item;
    if (location === 'congelador') frozen.push(entry);
    else if (location === 'despensa') (entry.longLife ? pantryLong : pantryFresh).push(entry);
    else if (category && DOOR.has(category)) kitchen.fridge.door.push(entry);
    else if (category && DRAWER.has(category) && entry.light !== 'red')
      kitchen.fridge.drawer.push(entry);
    else kitchen.fridge.shelves[shelfOf(entry)].push(entry);
  }
  kitchen.freezer.drawers = split(frozen, 3);
  // The pantry: what goes off on the top shelves, the staples at the bottom.
  kitchen.pantry.shelves = [...split(pantryFresh, 2), ...split(pantryLong, 2)];
  return kitchen;
}

/** A shelf shows this many, then "+3" opens the rest. */
export const SHELF_SHOWN = 6;
