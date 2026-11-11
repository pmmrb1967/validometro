// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/** One plain line drawing per kind of food (domain/kitchen.ts iconFor), in the text colour. */
import type { FoodIcon as Kind } from '../../domain/kitchen';

const PATHS: Record<Kind, string> = {
  bottle:
    'M10 2.5h4v3l1.8 2.7V20a1.5 1.5 0 0 1-1.5 1.5H9.7A1.5 1.5 0 0 1 8.2 20V8.2L10 5.5zM8.2 12h7.6',
  carton: 'M7 8.5 9.5 3h5L17 8.5V20a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1zM7 8.5h10M12 3v5.5',
  egg: 'M12 3c3.6 0 6.2 5.4 6.2 10.2a6.2 6.2 0 0 1-12.4 0C5.8 8.4 8.4 3 12 3z',
  meat: 'M5 10.5C5 7 8.8 4.5 13 4.5s7 2.8 7 6.2c0 2.5-1.8 3.6-3.6 4.6-1.9 1-2.7 4.2-6.9 4.2C6.4 19.5 5 15 5 10.5zM14.5 9.5a1.8 1.8 0 1 1-.01 0',
  fish: 'M2.5 12c3.2-5 9.3-6.2 13.5-2l4-3v10l-4-3c-4.2 4.2-10.3 3-13.5-2zM7.5 11h.01',
  cheese: 'M3 18v-5.2L14 6l7 4.2V18zM3 12.8h18M8 15.5h.01M15 15h.01M12 10.5h.01',
  cup: 'M5 4h14v3H5zM6.2 7h11.6l-1.4 12.8a1.4 1.4 0 0 1-1.4 1.2H9a1.4 1.4 0 0 1-1.4-1.2z',
  leaf: 'M5 19C5 10 11 5 20 5c0 9-5.5 15-14.5 15M5 19l8.5-8.5',
  apple:
    'M12 7.5C10 5.5 5 5.5 5 11c0 5 3 10 7 9.2 4 .8 7-4.2 7-9.2 0-5.5-5-5.5-7-3.5zM12 7.5c0-2.2 1-3.8 3-4.5',
  bread:
    'M4 10.5A4.5 4.5 0 0 1 8.5 6h7a4.5 4.5 0 0 1 2.5 8.2V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4.8A4.5 4.5 0 0 1 4 10.5z',
  jar: 'M8 3h8v3H8zM7 6h10a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM6 11h12',
  box: 'M4 8l8-4 8 4v9l-8 4-8-4zM4 8l8 4 8-4M12 12v9',
  frozen: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 6.5l2.5-2M9.5 19.5 12 17.5l2.5 2',
  sweet: 'M8 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0M8 12 4 9v6zM16 12l4-3v6z',
  food: 'M4 12a8 8 0 1 0 16 0 8 8 0 1 0-16 0M8 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
};

export function FoodIcon({ kind }: { kind: Kind }) {
  return (
    <svg
      className="food-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[kind]} />
    </svg>
  );
}
