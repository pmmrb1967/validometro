// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
import { DEVICE_ID } from '../domain/ai-cost';

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

const DEVICE_KEY = 'validometro.device';
let sessionDevice: string | undefined;

/**
 * A random id for this device, only to count its share of the free AI each day
 * (src/worker/free-ai.ts). The server keeps sha256(secret + day + id), never the id.
 */
export function deviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved && DEVICE_ID.test(saved)) return saved;
  } catch {
    // No storage: the id lasts while the page is open.
  }
  if (!sessionDevice) {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    sessionDevice = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    try {
      localStorage.setItem(DEVICE_KEY, sessionDevice);
    } catch {
      // As above.
    }
  }
  return sessionDevice;
}
