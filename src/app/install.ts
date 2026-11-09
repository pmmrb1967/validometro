// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Wattómetro and Faturómetro (src/app/install.ts).
/**
 * "Install app": Chrome/Edge (Android and computer) fire beforeinstallprompt,
 * which is kept to show the browser's own install dialog from a button.
 * Other browsers do not let a site install itself: the steps for that
 * browser are shown instead. Chrome/Edge do not fire the event either when
 * the app is already installed; getInstalledRelatedApps tells (the manifest's
 * related_applications points to the app itself).
 */
import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Browsers that need steps instead of an install dialog. */
export type ManualBrowser =
  'ios' | 'safari-mac' | 'firefox-android' | 'firefox-desktop' | 'samsung' | 'chromium';

export type InstallState =
  | { kind: 'installed' }
  /** Installed on this device, but opened in the browser. */
  | { kind: 'installed-elsewhere' }
  | { kind: 'prompt' }
  | { kind: 'manual'; browser: ManualBrowser };

let deferred: BeforeInstallPromptEvent | undefined;
let installed = false;
let installedHere = false;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

export function standalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function manualBrowser(userAgent: string, maxTouchPoints: number): ManualBrowser {
  // iPadOS reports itself as a Mac with touch.
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/SamsungBrowser/.test(userAgent)) return 'samsung';
  if (/Firefox\//.test(userAgent)) {
    return /Android/.test(userAgent) ? 'firefox-android' : 'firefox-desktop';
  }
  const safari = /Safari\//.test(userAgent) && !/Chrome|Chromium|Edg\//.test(userAgent);
  if (/Macintosh/.test(userAgent) && safari) return 'safari-mac';
  return 'chromium';
}

async function checkInstalledHere(): Promise<void> {
  const nav = navigator as Navigator & {
    getInstalledRelatedApps?: () => Promise<{ platform: string }[]>;
  };
  if (!nav.getInstalledRelatedApps) return;
  try {
    const apps = await nav.getInstalledRelatedApps();
    installedHere = apps.some((app) => app.platform === 'webapp');
    notify();
  } catch {
    // Not allowed here (e.g. in a frame): the steps stay.
  }
}

/** Called once at start-up, before the browser fires the event. */
export function listenForInstall(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = undefined;
    notify();
  });
  void checkInstalledHere();
}

let snapshot: InstallState = { kind: 'manual', browser: 'chromium' };

function current(): InstallState {
  const next: InstallState =
    installed || standalone()
      ? { kind: 'installed' }
      : deferred
        ? { kind: 'prompt' }
        : installedHere
          ? { kind: 'installed-elsewhere' }
          : {
              kind: 'manual',
              browser: manualBrowser(navigator.userAgent, navigator.maxTouchPoints),
            };
  // Only kind and browser change while the page is open.
  const same =
    next.kind === snapshot.kind &&
    (next.kind !== 'manual' || (snapshot.kind === 'manual' && snapshot.browser === next.browser));
  if (!same) snapshot = next;
  return snapshot;
}

export function useInstallState(): InstallState {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, current);
}

/** Shows the browser's install dialog; true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  await event.prompt();
  const { outcome } = await event.userChoice;
  deferred = undefined;
  notify();
  return outcome === 'accepted';
}
