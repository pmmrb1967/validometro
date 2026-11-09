// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Waste statistics (Phase 4): per month, what was eaten and what was thrown away; and the
 * categories thrown away most. Counted in items, never in quantities (principle 2).
 */
import { categoryById } from './categories';
import { lisbonDate } from './dates';
import type { Item } from './types';

export interface MonthStats {
  /** "2026-11" */
  month: string;
  eaten: number;
  wasted: number;
}

export interface CategoryWaste {
  category: string | null;
  label: string;
  wasted: number;
}

export interface WasteStats {
  months: MonthStats[];
  categories: CategoryWaste[];
  /** All months shown together. */
  eaten: number;
  wasted: number;
}

/** "2026-11" and the months before it, oldest first. */
export function lastMonths(today: string, count: number): string[] {
  const [year, month] = today.split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, index) => {
    const back = count - 1 - index;
    const date = new Date(Date.UTC(year, month - 1 - back, 1));
    return date.toISOString().slice(0, 7);
  });
}

/** Resolved items, by the Lisbon month they were resolved in. */
export function wasteStats(items: Item[], today: string, monthCount = 6): WasteStats {
  const months = lastMonths(today, monthCount);
  const byMonth = new Map(months.map((month) => [month, { month, eaten: 0, wasted: 0 }]));
  const byCategory = new Map<string | null, number>();
  for (const item of items) {
    if (item.status === 'ativo' || !item.resolved_at) continue;
    const entry = byMonth.get(lisbonDate(new Date(item.resolved_at)).slice(0, 7));
    if (!entry) continue;
    if (item.status === 'consumido') {
      entry.eaten++;
    } else {
      entry.wasted++;
      byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + 1);
    }
  }
  const list = [...byMonth.values()];
  return {
    months: list,
    categories: [...byCategory]
      .map(([category, wasted]) => ({
        category,
        label: categoryById(category)?.label ?? 'Outro',
        wasted,
      }))
      .sort((a, b) => b.wasted - a.wasted || a.label.localeCompare(b.label, 'pt'))
      .slice(0, 5),
    eaten: list.reduce((sum, month) => sum + month.eaten, 0),
    wasted: list.reduce((sum, month) => sum + month.wasted, 0),
  };
}
