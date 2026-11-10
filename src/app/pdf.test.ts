// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { piecesToLines } from './pdf';

describe('PDF receipt text', () => {
  it('joins pieces at the same height into lines, top to bottom', () => {
    expect(
      piecesToLines([
        { str: '1,29', x: 200, y: 700 },
        { str: 'IOG NAT 4X125', x: 10, y: 701 },
        { str: 'CONTINENTE', x: 60, y: 760 },
        { str: '  ', x: 10, y: 650 },
        { str: 'ARROZ  AGULHA', x: 10, y: 680 },
        { str: '1,49', x: 200, y: 680 },
      ]),
    ).toEqual(['CONTINENTE', 'IOG NAT 4X125 1,29', 'ARROZ AGULHA 1,49']);
  });
});
