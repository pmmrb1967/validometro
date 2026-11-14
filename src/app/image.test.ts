// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { keepAboveQr, MIN_KEEP } from './image';
import { topFromPoints } from './receipt-qr';

describe('cutting a receipt photo at its QR code', () => {
  it('keeps what is above the code, with a little room', () => {
    expect(keepAboveQr(0.8)).toBeCloseTo(0.78);
    expect(keepAboveQr(null)).toBe(1);
  });

  it('sends it whole when the code is near the top (a photo of the end only)', () => {
    expect(keepAboveQr(MIN_KEEP - 0.05)).toBe(1);
  });

  it("finds where the code begins from zxing's finder patterns", () => {
    // Three centres 100 px apart: the code starts a quarter of that above the highest.
    const top = topFromPoints([
      { x: 100, y: 600 },
      { x: 100, y: 500 },
      { x: 200, y: 500 },
    ]);
    expect(top).toBe(475);
    expect(topFromPoints([{ x: 1, y: 1 }])).toBeNull();
  });
});
