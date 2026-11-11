// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  parseReceiptQr,
  receiptLines,
  receiptQrHash,
  resembling,
  type SeenReceipt,
} from './receipts';

/** The AT's QR code of a simplified invoice (Portaria 195/2020), with made-up numbers. */
const QR =
  'A:500123456*B:999999990*C:PT*D:FS*E:N*F:20261111*G:FS 0123/45678*H:JJ3X4Y5Z-45678*' +
  'I1:PT*I7:10.50*I8:2.42*N:2.42*O:12.92*Q:ab1C*R:1234';

function seen(overrides: Partial<SeenReceipt>): SeenReceipt {
  return {
    id: 'r',
    household_id: 'local',
    qr_hash: null,
    store: 'Continente',
    date: '2026-11-11',
    lines: receiptLines(['IOG NAT 4X', 'LEITE M/G 1L', 'PAO MISTURA', 'FRANGO INT']),
    items: 4,
    created_at: '2026-11-11T10:00:00.000Z',
    updated_at: '2026-11-11T10:00:00.000Z',
    ...overrides,
  };
}

describe('the same receipt, read twice', () => {
  it('reads the shop, the document, the day and the total from the QR code', () => {
    expect(parseReceiptQr(QR)).toEqual({
      issuer: '500123456',
      document: 'FS 0123/45678',
      date: '2026-11-11',
      total: 12.92,
    });
    // Not the AT's code (a link, a product): nothing.
    expect(parseReceiptQr('https://example.pt/talao')).toBeNull();
    expect(parseReceiptQr('A:123*G:FS 1/2')).toBeNull();
  });

  it('keeps only a hash: the same for the same receipt, whoever reads it', async () => {
    const one = await receiptQrHash(parseReceiptQr(QR)!);
    const again = await receiptQrHash(parseReceiptQr(QR.replace('B:999999990', 'B:123456789'))!);
    const other = await receiptQrHash(parseReceiptQr(QR.replace('45678*H', '45679*H'))!);
    expect(one).toMatch(/^[0-9a-f]{64}$/);
    // The buyer's number (B) is not part of it.
    expect(again).toBe(one);
    expect(other).not.toBe(one);
    expect(one).not.toContain('500123456');
  });

  it('without a QR code, tells most of the same lines on the same day', () => {
    const before = [seen({})];
    // A second photo of it: the prices read a little differently, one line missed.
    const lines = receiptLines(['IOG NAT 4X 2,49', 'LEITE M/G 1L', 'PAO MISTURA 1,20']);
    expect(resembling({ store: 'continente', date: '2026-11-11', lines }, before)).toMatchObject({
      shared: 3,
      of: 3,
    });
    // Another day, another shop, or other lines: not the same.
    expect(resembling({ store: null, date: '2026-11-12', lines }, before)).toBeUndefined();
    expect(resembling({ store: 'Pingo Doce', date: null, lines }, before)).toBeUndefined();
    const others = receiptLines(['IOG NAT 4X', 'OVOS M 12', 'ALFACE', 'TOMATE']);
    expect(resembling({ store: null, date: null, lines: others }, before)).toBeUndefined();
  });
});
