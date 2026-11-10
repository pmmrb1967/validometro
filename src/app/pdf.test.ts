// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { piecesToLines, receiptTextForAi } from './pdf';

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

describe('what a PDF receipt sends', () => {
  it('keeps the products and the date, and leaves the person out', () => {
    const lines = [
      'Pingo Doce - Distribuição Alimentar, S.A.',
      'TALHO',
      'C FRANGO INT C MIÚDOS 1,632 X 2,49 4,06',
      'Poupança Imediata (0,23)',
      'Resumo',
      'TOTAL 67,59',
      'Multibanco 49,36',
      'Cartão Poupa Mais nº: ***209',
      'Expiram a 30-11-2026: 4 EUR',
      '474469 2026-11-10 14:36 0002 0001 0374',
      'N. Contribuinte: 123456789',
      'ATCUD:ABCD-1',
      'Atendido por: Alguém',
    ];
    expect(receiptTextForAi(lines)).toEqual([
      'Pingo Doce - Distribuição Alimentar, S.A.',
      'TALHO',
      'C FRANGO INT C MIÚDOS 1,632 X 2,49 4,06',
      'Poupança Imediata (0,23)',
      '474469 2026-11-10 14:36 0002 0001 0374',
    ]);
  });
});
