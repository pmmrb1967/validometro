// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The daily alert on this device (Web Push): ask permission, subscribe with the server's
 * VAPID key, and register the subscription with the account (src/worker/alerts.ts).
 */
import { ApiError } from './api';
import { here } from './device';

export function pushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** iPhone and iPad: notifications only reach a PWA added to the home screen (iOS 16.4+). */
export function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64url.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function send(method: string, path: string, body: unknown): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Sem ligação à internet. Tenta mais tarde.');
  }
  if (!res.ok) {
    let message = 'Algo correu mal. Tenta outra vez.';
    try {
      message = ((await res.json()) as { error?: string }).error ?? message;
    } catch {
      // No body.
    }
    throw new ApiError(message);
  }
  return res;
}

export async function enableAlerts(): Promise<void> {
  if (!pushSupported()) throw new ApiError('Este browser não recebe notificações.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new ApiError(
      'As notificações estão bloqueadas. Permite-as nas definições do browser para este site.',
    );
  }
  const keyRes = await fetch('/api/push/key').catch(() => null);
  if (!keyRes?.ok) throw new ApiError('Os alertas ainda não estão ligados no servidor.');
  const { publicKey } = (await keyRes.json()) as { publicKey: string };
  const reg = await registration();
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  const json = subscription.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  await send('PUT', '/api/push/subscription', { endpoint: json.endpoint, keys: json.keys });
}

export async function disableAlerts(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await send('DELETE', '/api/push/subscription', { endpoint: subscription.endpoint }).catch(
    () => undefined,
  );
  await subscription.unsubscribe();
}

export async function testAlert(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) throw new ApiError(`Ativa primeiro os alertas ${here()}.`);
  await send('POST', '/api/push/test', { endpoint: subscription.endpoint });
}
