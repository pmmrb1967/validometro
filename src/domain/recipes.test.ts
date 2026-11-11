// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { groupRecipes, linkItems, recipesPerItem, type SavedRecipe } from './recipes';

function recipe(overrides: Partial<SavedRecipe>): SavedRecipe {
  return {
    id: 'r',
    household_id: 'local',
    title: 'Frango grelhado',
    minutes: 20,
    usa: ['frango'],
    falta: [],
    steps: ['Grelhar.'],
    item_ids: ['chicken'],
    starred: false,
    state: 'nova',
    created_at: '2026-11-10T12:00:00.000Z',
    updated_at: '2026-11-10T12:00:00.000Z',
    ...overrides,
  };
}

const NOW = new Date('2026-11-11T12:00:00.000Z');

describe('saved recipes', () => {
  it('link to the items they use, by name either way round', () => {
    const items = [
      { id: 'chicken', name: 'Peito de frango' },
      { id: 'lettuce', name: 'Alface' },
      { id: 'cream', name: 'Natas' },
    ];
    expect(linkItems(['frango', 'natas frescas'], items)).toEqual(['chicken', 'cream']);
    // Nothing recognised: all those it was asked for.
    expect(linkItems(['arroz'], items)).toEqual(['chicken', 'lettuce', 'cream']);
  });

  it('come first while their items are at home; then starred; then the last 30 days', () => {
    const groups = groupRecipes(
      [
        recipe({ id: 'now' }),
        recipe({ id: 'made', state: 'feita' }),
        recipe({ id: 'kept', item_ids: ['gone'], starred: true }),
        recipe({ id: 'past', item_ids: ['gone'] }),
        recipe({ id: 'old', item_ids: ['gone'], created_at: '2026-09-01T12:00:00.000Z' }),
        recipe({ id: 'removed', state: 'removida' }),
      ],
      new Set(['chicken']),
      NOW,
    );
    expect(groups.current.map((one) => one.id)).toEqual(['now']);
    expect(groups.starred.map((one) => one.id)).toEqual(['kept']);
    expect(groups.past.map((one) => one.id)).toEqual(['made', 'past']);
  });

  it('count, per item, the recipes still to make', () => {
    const counts = recipesPerItem([
      recipe({ id: 'a', item_ids: ['chicken', 'cream'] }),
      recipe({ id: 'b' }),
      recipe({ id: 'c', state: 'feita' }),
    ]);
    expect(counts.get('chicken')).toBe(2);
    expect(counts.get('cream')).toBe(1);
  });
});
