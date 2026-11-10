// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { parseQuantity, quantityInputText } from './units';

describe('quantities typed in the review', () => {
  it('reads Portuguese decimals and treats empty or invalid as no quantity', () => {
    expect(parseQuantity('1,632')).toBe(1.632);
    expect(parseQuantity(' 2 ')).toBe(2);
    expect(parseQuantity('0.5')).toBe(0.5);
    expect(parseQuantity('')).toBeNull();
    expect(parseQuantity('0')).toBeNull();
    expect(parseQuantity('dois')).toBeNull();
  });

  it('shows a stored quantity the way it is typed', () => {
    expect(quantityInputText(1.632)).toBe('1,632');
    expect(quantityInputText(6)).toBe('6');
    expect(quantityInputText(null)).toBe('');
  });
});
