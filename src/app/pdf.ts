// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * A receipt in a PDF file (the supermarket's digital receipt, by email or in its app). Read on
 * the phone with pdf.js, loaded only when a PDF is chosen: a digital PDF has its text, which
 * is sent as lines (cheaper and more exact than a photo); a scanned one has none, and its
 * first page goes as an image instead. The file itself never leaves the phone.
 */
import { shrinkPhoto } from './image';

/** Enough for a long receipt; more pages would be a statement, not a receipt. */
const MAX_PAGES = 6;
/** Less text than this is a scanned PDF (or an empty one). */
const MIN_TEXT = 40;

export type PdfReceipt = { text: string } | { image: string } | null;

interface TextPiece {
  str: string;
  x: number;
  y: number;
}

/**
 * Pieces of text into the receipt's lines: the same height is the same line (the name on
 * the left, the price on the right), top to bottom, left to right.
 */
export function piecesToLines(pieces: TextPiece[]): string[] {
  const rows: { y: number; pieces: TextPiece[] }[] = [];
  for (const piece of pieces) {
    if (!piece.str.trim()) continue;
    const row = rows.find((candidate) => Math.abs(candidate.y - piece.y) < 3);
    if (row) row.pieces.push(piece);
    else rows.push({ y: piece.y, pieces: [piece] });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) =>
      row.pieces
        .sort((a, b) => a.x - b.x)
        .map((piece) => piece.str.trim())
        .join(' ')
        .replace(/\s+/g, ' '),
    );
}

export async function readPdfReceipt(file: Blob): Promise<PdfReceipt> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  try {
    const lines: string[] = [];
    for (let number = 1; number <= Math.min(pdf.numPages, MAX_PAGES); number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const pieces = content.items.flatMap((item) =>
        'str' in item
          ? [{ str: item.str, x: Number(item.transform[4]), y: Number(item.transform[5]) }]
          : [],
      );
      lines.push(...piecesToLines(pieces));
    }
    const text = lines.join('\n').trim();
    if (text.length >= MIN_TEXT) return { text: text.slice(0, 30_000) };

    // Scanned: the first page as a photo, made small like any other.
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = 1600 / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    const image = blob ? await shrinkPhoto(blob) : null;
    return image ? { image } : null;
  } finally {
    void task.destroy();
  }
}
