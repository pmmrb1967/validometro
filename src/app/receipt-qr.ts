// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The QR code of a Portuguese receipt, read on the phone before the AI is asked
 * (domain/receipts.ts): the browser's BarcodeDetector where there is one, else zxing-js,
 * loaded only then. From the original photo, not the small copy sent to the AI: on a long
 * receipt the code would be too small there to read. Nothing is kept but what
 * parseReceiptQr returns.
 */
import { parseReceiptQr, type ReceiptQr } from '../domain/receipts';

/** Big enough for a dense code on a long receipt, small enough for zxing on a phone. */
const MAX_SIDE = 3200;
const BAND_SIDE = 1000;

interface QrDetector {
  detect(source: HTMLCanvasElement): Promise<{ rawValue: string }[]>;
}

async function nativeQr(): Promise<QrDetector | undefined> {
  const Detector = (
    window as Window & {
      BarcodeDetector?: {
        new (options: { formats: string[] }): QrDetector;
        getSupportedFormats(): Promise<string[]>;
      };
    }
  ).BarcodeDetector;
  if (!Detector) return undefined;
  try {
    return (await Detector.getSupportedFormats()).includes('qr_code')
      ? new Detector({ formats: ['qr_code'] })
      : undefined;
  } catch {
    return undefined;
  }
}

/** The texts of the QR codes on a canvas (none: an empty list). */
export async function qrTexts(canvas: HTMLCanvasElement): Promise<string[]> {
  const native = await nativeQr();
  if (native) {
    try {
      const found = (await native.detect(canvas)).map((code) => code.rawValue);
      if (found.length) return found;
    } catch {
      // Then zxing.
    }
  }
  // No BarcodeDetector (iPhone), or it found nothing: zxing reads some codes it misses.
  try {
    const [{ BrowserQRCodeReader }, { DecodeHintType }] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ]);
    // Harder: slower, but finds a code in a photo (glare, a slight tilt).
    const hints = new Map([[DecodeHintType.TRY_HARDER, true]]);
    return [new BrowserQRCodeReader(hints).decodeFromCanvas(canvas).getText()];
  } catch {
    // zxing throws when there is no code.
    return [];
  }
}

async function toCanvas(image: Blob): Promise<HTMLCanvasElement | null> {
  try {
    const bitmap = await createImageBitmap(image);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas;
  } catch {
    return null;
  }
}

async function atQr(canvas: HTMLCanvasElement): Promise<ReceiptQr | null> {
  for (const text of await qrTexts(canvas)) {
    const qr = parseReceiptQr(text);
    if (qr) return qr;
  }
  return null;
}

/**
 * A long receipt in overlapping square bands, from the bottom (where the code usually is):
 * in the whole of it the code is too small a part for the readers to find.
 */
function bands(canvas: HTMLCanvasElement): HTMLCanvasElement[] {
  const side = canvas.width;
  if (canvas.height < side * 1.2) return [];
  // Drawn no bigger than this: zxing finds a code better in a moderate picture.
  const scale = Math.min(1, BAND_SIDE / side);
  const list: HTMLCanvasElement[] = [];
  for (let top = canvas.height - side; top > -side / 2; top -= side / 2) {
    const y = Math.max(0, Math.round(top));
    const height = Math.min(side, canvas.height - y);
    const band = document.createElement('canvas');
    band.width = Math.round(side * scale);
    band.height = Math.round(height * scale);
    const context = band.getContext('2d');
    if (context) {
      // A photo's grey paper and faint print behind the code: more contrast helps the reader.
      context.filter = 'grayscale(1) contrast(1.8)';
      context.drawImage(canvas, 0, y, side, height, 0, 0, band.width, band.height);
    }
    list.push(band);
    if (y === 0) break;
  }
  return list;
}

/** The receipt's QR code in a canvas, if it has the AT's one. */
export async function receiptQrIn(canvas: HTMLCanvasElement): Promise<ReceiptQr | null> {
  const whole = await atQr(canvas);
  if (whole) return whole;
  for (const band of bands(canvas)) {
    const qr = await atQr(band);
    if (qr) return qr;
  }
  return null;
}

/** The receipt's QR code in any of these photos (the last part first: it is at the end). */
export async function receiptQrInPhotos(photos: readonly Blob[]): Promise<ReceiptQr | null> {
  for (const photo of [...photos].reverse()) {
    const canvas = await toCanvas(photo);
    const qr = canvas && (await receiptQrIn(canvas));
    if (qr) return qr;
  }
  return null;
}
