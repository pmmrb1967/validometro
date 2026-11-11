// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/** "neste telemóvel" or "neste computador": what is kept here is said by its own name. */
export function here(): string {
  try {
    const phone =
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      window.matchMedia('(pointer: coarse)').matches;
    return phone ? 'neste telemóvel' : 'neste computador';
  } catch {
    return 'neste dispositivo';
  }
}
