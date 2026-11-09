// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Whether "/" shows the landing page: someone new, with no account, nothing registered on
 * this phone, and who never chose "Começar sem conta". Shared by Home (what to show) and the
 * top bar (no "Definições" before starting: there is nothing to set yet).
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useAccount } from './account';
import { useStarted } from './started';
import { db } from './store/items';

/** undefined while still finding out (account or local data loading). */
export function useShowLanding(): boolean | undefined {
  const account = useAccount();
  const started = useStarted();
  const count = useLiveQuery(() => db.items.count(), []);
  if (account.status === 'loading' || count === undefined) return undefined;
  return !account.me && !started && count === 0;
}
