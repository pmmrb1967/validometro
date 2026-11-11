// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/** About how much the AI button next to it spends: tapping it is the consent, no extra step. */
import type { CostOperation } from '../../domain/ai-cost';
import { useCostNote } from '../ai-cost';

export function AiCostNote({
  operation,
  photos = 1,
}: {
  operation: CostOperation;
  photos?: number;
}) {
  const note = useCostNote(operation, photos);
  return note ? <p className="ai-cost">{note}</p> : null;
}
