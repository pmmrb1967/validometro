// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { aliasKey, plausiblePrintedDate, purchaseDay, storeKey, toDraft } from './drafts';

const today = '2026-11-09';
const line = {
  raw: 'FIL PESC 400G',
  name: 'Filetes de pescada',
  category: null,
  quantity: null,
  unit: null,
  perishable: true,
};

describe('aliasKey', () => {
  it('ignores accents, case, spacing and the price at the end', () => {
    expect(aliasKey('  Pão  Rústico 1,29 €')).toBe('pao rustico');
    expect(aliasKey('IOG. NAT 4X125G 2,49')).toBe(aliasKey('iog. nat 4x125g'));
  });

  it('keeps weights that are part of the product', () => {
    expect(aliasKey('FIL PESC 400G')).toBe('fil pesc 400g');
  });

  it('normalizes the store, empty when unknown', () => {
    expect(storeKey(' Pingo  Doce')).toBe('pingo doce');
    expect(storeKey(null)).toBe('');
  });
});

describe('toDraft', () => {
  it('guesses the category from the name and estimates from the rules', () => {
    const draft = toDraft(line, undefined, today);
    expect(draft.category).toBe('peixe_fresco');
    expect(draft.location).toBe('frigorifico');
    expect(draft.expiry_source).toBe('estimada');
    expect(draft.expires_at! > today).toBe(true);
  });

  it('lets the dictionary win over the AI', () => {
    const draft = toDraft(
      line,
      { canonical_name: 'Pescada congelada', category: 'congelados', perishable: true },
      today,
    );
    expect(draft).toMatchObject({
      name: 'Pescada congelada',
      category: 'congelados',
      location: 'congelador',
      known: true,
    });
  });

  it('leaves long-life items without a date', () => {
    const draft = toDraft(
      { ...line, name: 'Arroz', category: null, perishable: false },
      undefined,
      today,
    );
    expect(draft.expires_at).toBeNull();
    expect(draft.expiry_source).toBeNull();
  });

  it('never estimates a date already behind us', () => {
    const draft = toDraft({ ...line, name: 'Peito de frango' }, undefined, today, '2026-10-01');
    expect(draft.expires_at! >= today).toBe(true);
  });

  it('drops a quantity that makes no sense', () => {
    expect(toDraft({ ...line, quantity: 0 }, undefined, today).quantity).toBeNull();
  });
});

describe('purchaseDay', () => {
  it('uses a recent receipt date, else today', () => {
    expect(purchaseDay('2026-11-05', today)).toBe('2026-11-05');
    expect(purchaseDay('2026-09-01', today)).toBe(today);
    expect(purchaseDay('2026-12-01', today)).toBe(today);
    expect(purchaseDay(null, today)).toBe(today);
  });
});

describe('plausiblePrintedDate', () => {
  it('keeps real food dates only', () => {
    expect(plausiblePrintedDate('2026-11-20', today)).toBe('2026-11-20');
    expect(plausiblePrintedDate('2026-02-30', today)).toBeNull();
    expect(plausiblePrintedDate('1999-01-01', today)).toBeNull();
    expect(plausiblePrintedDate(null, today)).toBeNull();
  });
});
