// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Whether "/" shows the landing page: no account, and either "Sair" was chosen, or someone
 * new (nothing registered on this phone, never chose "Começar sem conta"). Shared by Home (what to show) and the
 * top bar (no "Definições" before starting: there is nothing to set yet).
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useAccount } from './account';
import { useStartChoice } from './started';
import { db } from './store/items';

/** undefined while still finding out (account or local data loading). */
export function useShowLanding(): boolean | undefined {
  const account = useAccount();
  const choice = useStartChoice();
  const count = useLiveQuery(() => db.items.count(), []);
  if (account.status === 'loading' || count === undefined) return undefined;
  if (account.me) return false;
  // Never chosen: someone new only if nothing is registered (from before "started" was kept).
  return choice === 'left' || (choice === null && count === 0);
}
