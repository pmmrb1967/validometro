// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { anonymize, isNif } from './anonymize';

/** A digital receipt as pdf.ts turns it into lines, with what is about the person. */
const RECEIPT = `PINGO DOCE - DISTRIBUIÇÃO ALIMENTAR, S.A.
Rua Actor António Silva, 7
1649-033 Lisboa
NIF 500829993
Cliente: Ana Maria Silva
Telem. 912 345 678
ana.silva@example.pt
LEITE M/G UHT 1L 2 X 0,79 1,58
QUEIJO FRESCO 4X65G 2,29
BANANA KG 1,632 X 1,19 1,94
VINHO QUINTA DO CRASTO 75CL 9,99
IOG NAT 4X125G 1,29
Cartão Visa ************1234
Data 2026-11-10 18:32 Doc FS 0123/456789
Atendido por João Pereira`;

describe('anonymize', () => {
  it('knows a Portuguese tax number by its check digit', () => {
    expect(isNif('500829993')).toBe(true);
    expect(isNif('123456789')).toBe(true);
    expect(isNif('123456780')).toBe(false);
    expect(isNif('912345678')).toBe(false);
  });

  it('takes out what is about the person, and keeps what was bought', () => {
    const { text, removed } = anonymize(RECEIPT);
    for (const personal of [
      'Actor António',
      '1649-033',
      '500829993',
      'Ana Maria',
      '912 345 678',
      'ana.silva',
      '1234',
      'João',
      'Pereira',
    ]) {
      expect(text).not.toContain(personal);
    }
    for (const bought of [
      'LEITE M/G UHT 1L 2 X 0,79 1,58',
      'QUEIJO FRESCO 4X65G 2,29',
      'BANANA KG 1,632 X 1,19 1,94',
      'VINHO QUINTA DO CRASTO 75CL 9,99',
      'IOG NAT 4X125G 1,29',
      'Data 2026-11-10 18:32 Doc FS 0123/456789',
    ]) {
      expect(text).toContain(bought);
    }
    expect(removed).toMatchObject({
      MORADA: 1,
      'CÓDIGO POSTAL': 1,
      NIF: 1,
      NOME: 2,
      TELEFONE: 1,
      EMAIL: 1,
      CARTÃO: 1,
    });
  });

  it('leaves a spoken list alone', () => {
    const said = 'comprei leite, dois iogurtes e o cliente do lado levou a última rua de pão';
    expect(anonymize(said).text).toBe(said);
    expect(anonymize('frango que acaba a 20/11/2026, 1,5 kg').text).toBe(
      'frango que acaba a 20/11/2026, 1,5 kg',
    );
  });

  it('does not take "Consumidor final" for a name', () => {
    expect(anonymize('Cliente: Consumidor final').text).toBe('Cliente: Consumidor final');
  });

  it('is the same when run twice (on the phone, then in the Worker)', () => {
    const once = anonymize(RECEIPT).text;
    expect(anonymize(once).text).toBe(once);
  });
});
