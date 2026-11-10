// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The account on this device: who is signed in (if anyone), and the calls that change it.
 * Without an account the app works as before, everything on the phone.
 */
import { useSyncExternalStore } from 'react';
import { ApiError } from './api';
import { forgetStarted } from './started';

export interface Me {
  email: string;
  household: { id: string; name: string } | null;
  admin: boolean;
  ai: { provider: 'workers-ai' | 'gemini' | 'anthropic'; model: string | null; hasKey: boolean };
}

export interface HouseholdInfo {
  id: string;
  name: string;
  inviteCode: string;
  members: { email: string; role: 'owner' | 'member'; you: boolean }[];
}

type State = { status: 'loading' } | { status: 'ready'; me: Me | null };

let state: State = { status: 'loading' };
const listeners = new Set<() => void>();

function set(next: State): void {
  state = next;
  for (const listener of listeners) listener();
}

export function useAccount(): State {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

export function currentUser(): Me | null {
  return state.status === 'ready' ? state.me : null;
}

/** Listeners for sign-in and sign-out (sync.ts links or clears the local copy). */
export const accountListeners = new Set<(me: Me | null, before: Me | null) => void>();

/** Raised on every sign-in or sign-out: an older "who is this?" answer must not undo it. */
let generation = 0;

function signedIn(me: Me | null): void {
  generation++;
  const before = currentUser();
  set({ status: 'ready', me });
  for (const listener of accountListeners) listener(me, before);
}

/** A JSON call with the session cookie; a 401 signs this device out. */
export async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
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
    if (res.status === 401 && path !== '/api/auth/login') signedIn(null);
    throw new ApiError(message);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Who is signed in; offline, the last answer stands (the cookie still works later). */
export async function refreshAccount(): Promise<Me | null> {
  const started = generation;
  try {
    const { user } = await call<{ user: Me | null }>('GET', '/api/auth/me');
    // Signed in or out while this was on its way (opening the app and signing up at once).
    if (generation !== started) return currentUser();
    signedIn(user);
    return user;
  } catch {
    if (state.status === 'loading') set({ status: 'ready', me: null });
    return currentUser();
  }
}

export async function register(email: string, password: string): Promise<Me> {
  const { user } = await call<{ user: Me }>('POST', '/api/auth/register', { email, password });
  signedIn(user);
  return user;
}

export async function signIn(email: string, password: string): Promise<Me> {
  const { user } = await call<{ user: Me }>('POST', '/api/auth/login', { email, password });
  signedIn(user);
  return user;
}

export async function signOut(): Promise<void> {
  await call('POST', '/api/auth/logout');
  forgetStarted();
  signedIn(null);
}

export async function changePassword(current: string, next: string): Promise<void> {
  await call('POST', '/api/account/password', { current, next });
}

export async function deleteAccount(password: string): Promise<void> {
  await call('DELETE', '/api/account', { password });
  forgetStarted();
  signedIn(null);
}

export function getHousehold(): Promise<HouseholdInfo> {
  return call('GET', '/api/household');
}

export async function renameHousehold(name: string): Promise<void> {
  await call('PUT', '/api/household', { name });
  await refreshAccount();
}

export async function joinHousehold(code: string): Promise<void> {
  await call('POST', '/api/household/join', { code });
  await refreshAccount();
}

export async function leaveHousehold(): Promise<void> {
  await call('POST', '/api/household/leave');
  await refreshAccount();
}

export function newInviteCode(): Promise<{ inviteCode: string }> {
  return call('POST', '/api/household/code');
}

export async function saveAccountAi(settings: {
  provider: Me['ai']['provider'];
  key?: string;
  model?: string | null;
}): Promise<void> {
  await call('PUT', '/api/account/ai', settings);
  await refreshAccount();
}

/** The link that joins this household: opens the sign-in with the code filled in. */
export function inviteLink(code: string): string {
  return `${location.origin}/conta?convite=${encodeURIComponent(code)}`;
}
