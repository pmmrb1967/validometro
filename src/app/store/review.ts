// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The reading waiting for review, between the add screen and the review screen. Kept in
 * sessionStorage so a reload (or the phone dropping the tab) does not lose a long receipt.
 */
import type { ReadingResult } from '../api';

export type ReadingSource = 'receipt' | 'voice';

export interface PendingReview extends ReadingResult {
  source: ReadingSource;
}

const KEY = 'validometro.review';

export function setPendingReview(review: PendingReview): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(review));
  } catch {
    // Storage full or blocked: the review screen will say there is nothing to review.
  }
}

export function getPendingReview(): PendingReview | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingReview) : null;
  } catch {
    return null;
  }
}

export function clearPendingReview(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
