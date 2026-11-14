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
  detect(
    source: HTMLCanvasElement,
  ): Promise<{ rawValue: string; boundingBox?: { y: number } | null }[]>;
}

/** A code found on a canvas: its text, and where it begins (pixels from the top), if known. */
interface FoundCode {
  text: string;
  top: number | null;
}

/**
 * Where a code begins, from zxing's points (the centres of its finder patterns, at about
 * 3.5 modules from the edge): a little above the highest, by a share of the code's size.
 */
export function topFromPoints(points: readonly { x: number; y: number }[]): number | null {
  if (points.length < 2) return null;
  const ys = points.map((point) => point.y);
  const xs = points.map((point) => point.x);
  const size = Math.max(Math.max(...ys) - Math.min(...ys), Math.max(...xs) - Math.min(...xs));
  return Math.max(0, Math.min(...ys) - size * 0.25);
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

/** The QR codes on a canvas (none: an empty list). */
async function qrCodes(canvas: HTMLCanvasElement): Promise<FoundCode[]> {
  const native = await nativeQr();
  if (native) {
    try {
      const found = (await native.detect(canvas)).map((code) => ({
        text: code.rawValue,
        top: typeof code.boundingBox?.y === 'number' ? code.boundingBox.y : null,
      }));
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
    const result = new BrowserQRCodeReader(hints).decodeFromCanvas(canvas);
    const points = (result.getResultPoints() ?? []).map((point) => ({
      x: point.getX(),
      y: point.getY(),
    }));
    return [{ text: result.getText(), top: topFromPoints(points) }];
  } catch {
    // zxing throws when there is no code.
    return [];
  }
}

async function toCanvas(image: Blob): Promise<HTMLCanvasElement | null> {
  try {
    // Turned as shrinkPhoto turns it, so a place found here is the same place there.
    const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
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

/** The AT's code on a canvas, and where it begins (pixels of that canvas). */
async function atQr(
  canvas: HTMLCanvasElement,
): Promise<{ qr: ReceiptQr; top: number | null } | null> {
  for (const code of await qrCodes(canvas)) {
    const qr = parseReceiptQr(code.text);
    if (qr) return { qr, top: code.top };
  }
  return null;
}

/**
 * A long receipt in overlapping square bands, from the bottom (where the code usually is):
 * in the whole of it the code is too small a part for the readers to find.
 */
interface Band {
  canvas: HTMLCanvasElement;
  /** Where it was cut from, to place what is found in it on the whole. */
  y: number;
  scale: number;
}

function bands(canvas: HTMLCanvasElement): Band[] {
  const side = canvas.width;
  if (canvas.height < side * 1.2) return [];
  // Drawn no bigger than this: zxing finds a code better in a moderate picture.
  const scale = Math.min(1, BAND_SIDE / side);
  const list: Band[] = [];
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
    list.push({ canvas: band, y, scale });
    if (y === 0) break;
  }
  return list;
}

/** The AT's code in a canvas, with where it begins (pixels of the whole canvas). */
async function receiptQrAt(
  canvas: HTMLCanvasElement,
): Promise<{ qr: ReceiptQr; top: number | null } | null> {
  const whole = await atQr(canvas);
  if (whole) return whole;
  for (const band of bands(canvas)) {
    const found = await atQr(band.canvas);
    if (found) {
      return {
        qr: found.qr,
        top: found.top === null ? null : band.y + found.top / band.scale,
      };
    }
  }
  return null;
}

/** The receipt's QR code in a canvas, if it has the AT's one. */
export async function receiptQrIn(canvas: HTMLCanvasElement): Promise<ReceiptQr | null> {
  return (await receiptQrAt(canvas))?.qr ?? null;
}

export interface QrInPhoto {
  qr: ReceiptQr;
  /** Where the code begins, as a share of the photo's height (0 top, 1 bottom), if known. */
  top: number | null;
}

/** The receipt's QR code in a photo as taken, and where it is (to cut the photo there). */
export async function receiptQrInPhoto(photo: Blob): Promise<QrInPhoto | null> {
  const canvas = await toCanvas(photo);
  if (!canvas) return null;
  const found = await receiptQrAt(canvas);
  if (!found) return null;
  return { qr: found.qr, top: found.top === null ? null : found.top / canvas.height };
}
