// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Wattómetro (src/lib/image.ts).
/**
 * Photos are made small in the browser before they go anywhere: the Worker has almost no CPU
 * and must not decode images (CLAUDE.md). Drawing again as JPEG also drops the camera's
 * metadata (EXIF: place, date, device).
 */

/** At most 1600 px on the long side, JPEG at 0.7: a receipt stays readable at ~300 KB. */
export const MAX_SIDE = 1600;
export const QUALITY = 0.7;

export function fitSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Where to cut a receipt photo so that its QR code and what follows it stay on the phone:
 * the buyer's tax number (in the code itself, field B), the cards, the loyalty points all
 * come after the total. `top`: where the code begins, as a share of the photo's height.
 * Returns the share kept from the top, or 1 (all of it) when there is too little above the
 * code to be worth sending alone (a photo of the end only).
 */
export function keepAboveQr(top: number | null): number {
  if (top === null) return 1;
  const keep = top - 0.02;
  return keep >= MIN_KEEP ? Math.min(1, keep) : 1;
}

/** Never less of a photo than this: the rest would be a strip with nothing to read. */
export const MIN_KEEP = 0.3;

/**
 * Base64 JPEG of a photo the browser can open, made small; null when it cannot open it.
 * `keep`: the share of it sent, from the top (a receipt without its end); the rest is never
 * drawn, so it is not in what is sent.
 */
export async function shrinkPhoto(file: Blob, keep = 1): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  const kept = Math.max(1, Math.round(bitmap.height * Math.min(1, Math.max(MIN_KEEP, keep))));
  const { width, height } = fitSize(bitmap.width, kept);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) context.drawImage(bitmap, 0, 0, bitmap.width, kept, 0, 0, width, height);
  bitmap.close();
  if (!context) return null;
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', QUALITY);
  });
  if (!blob) return null;
  const url = await dataUrl(blob);
  return url.slice(url.indexOf(',') + 1);
}

/**
 * Whether the photo button opens a camera (a phone or tablet) or a file picker (a computer):
 * the label says which, so "Fotografar" is never a folder that opens.
 */
export function hasCamera(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
}
