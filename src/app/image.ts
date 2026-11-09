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

/** Base64 JPEG of a photo the browser can open, made small; null when it cannot open it. */
export async function shrinkPhoto(file: Blob): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  const { width, height } = fitSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  if (!context) return null;
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', QUALITY);
  });
  if (!blob) return null;
  const url = await dataUrl(blob);
  return url.slice(url.indexOf(',') + 1);
}
