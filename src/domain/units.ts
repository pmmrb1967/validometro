// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/** Units offered when typing a quantity (any other text is accepted too). */
export const UNITS = ['un.', 'emb.', 'g', 'kg', 'ml', 'L'] as const;

/** "1,632" / "2" / "0.5" → a positive number; "" or anything else → null. */
export function parseQuantity(text: string): number | null {
  const amount = Number(text.trim().replace(',', '.'));
  return text.trim() && Number.isFinite(amount) && amount > 0 ? amount : null;
}

/** A quantity as typed in Portuguese ("1,632"); "" when there is none. */
export function quantityInputText(quantity: number | null): string {
  return quantity === null ? '' : String(quantity).replace('.', ',');
}
