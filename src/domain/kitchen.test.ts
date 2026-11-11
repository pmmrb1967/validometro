// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { arrangeKitchen, iconFor } from './kitchen';
import type { LitItem } from './traffic-light';
import type { Item } from './types';

function lit(
  name: string,
  location: Item['location'],
  category: string,
  light: LitItem['light'],
  longLife = false,
): LitItem {
  return {
    item: { id: name, name, location, category } as Item,
    daysLeft: light === 'red' ? 1 : light === 'amber' ? 5 : 20,
    light,
    longLife,
    undated: false,
  };
}

describe('the drawn kitchen', () => {
  it('puts what to use first on the top shelf, greens in the drawer, milk with the rest', () => {
    const kitchen = arrangeKitchen([
      lit('Frango', 'frigorifico', 'carne_fresca', 'red'),
      lit('Alface podre', 'frigorifico', 'legumes', 'red'),
      lit('Leite', 'frigorifico', 'leite_fresco', 'amber'),
      lit('Queijo', 'frigorifico', 'queijo_fresco', 'amber'),
      lit('Cenouras', 'frigorifico', 'legumes', 'green'),
      lit('Iogurte', 'frigorifico', 'iogurtes', 'green'),
    ]);
    const names = (list: LitItem[]) => list.map((entry) => entry.item.name);
    expect(kitchen.fridge.shelves.map(names)).toEqual([
      ['Frango', 'Alface podre'],
      ['Leite', 'Queijo'],
      ['Iogurte'],
    ]);
    expect(names(kitchen.fridge.drawer)).toEqual(['Cenouras']);
  });

  it('shares the freezer among its drawers and keeps the staples at the bottom of the pantry', () => {
    const kitchen = arrangeKitchen([
      lit('Pão', 'despensa', 'pao_fresco', 'red'),
      lit('Ervilhas', 'congelador', 'congelados', 'green'),
      lit('Arroz', 'despensa', 'longa_duracao', null, true),
      lit('Sopa', 'congelador', 'congelado_em_casa', 'green'),
    ]);
    expect(kitchen.freezer.drawers.flat().map((entry) => entry.item.name)).toEqual([
      'Ervilhas',
      'Sopa',
    ]);
    expect(kitchen.freezer.drawers).toHaveLength(3);
    expect(kitchen.pantry.shelves[0]!.map((entry) => entry.item.name)).toEqual(['Pão']);
    expect(kitchen.pantry.shelves.at(-2)!.map((entry) => entry.item.name)).toEqual(['Arroz']);
  });

  it('draws each kind of food, and something for the unknown', () => {
    expect(iconFor('peixe_fresco')).toBe('fish');
    expect(iconFor(null)).toBe('food');
    expect(iconFor('coisa_nova')).toBe('food');
  });
});
