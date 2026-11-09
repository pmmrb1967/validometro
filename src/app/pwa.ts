// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Faturómetro (src/app/pwa.ts).
/**
 * Service worker updates. Reloading would lose what is being typed (the add form), so a new
 * version is never applied by itself: a bar at the top offers it, and one tap reloads.
 */
import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

/** Installed apps resumed from memory never reload: look for new versions now and then. */
const CHECK_MINUTES = 60;

let needRefresh = false;
const listeners = new Set<() => void>();
let updateServiceWorker: ((reload?: boolean) => Promise<void>) | undefined;

export function registerPwa(): void {
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh = true;
      for (const listener of listeners) listener();
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => void registration.update().catch(() => undefined);
      window.setInterval(check, CHECK_MINUTES * 60_000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
}

export function useUpdateAvailable(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => needRefresh,
  );
}

export function applyUpdate(): void {
  void updateServiceWorker?.(true);
}
