// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The user's own data (RGPD): a JSON file with everything, and, without an account, erasing
 * what this phone keeps. With an account the server sends the file (GET /api/account/export)
 * and erasing is "Apagar a conta" (AccountSections).
 */
import { ApiError } from './api';
import { currentUser } from './account';
import { forgetStarted } from './started';
import { db } from './store/items';
import { clearCopy } from './sync';

function save(text: string): void {
  const date = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `validometro-dados-${date}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** This phone's data, as the server's file would have it (no account, nothing on the server). */
async function localExport(): Promise<string> {
  const [items, shopping] = await Promise.all([db.items.toArray(), db.shopping.toArray()]);
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      app: 'Validómetro (https://app.validometro.workers.dev)',
      account: null,
      items: items.map((item) => {
        const copy: Partial<typeof item> = { ...item };
        delete copy.household_id;
        delete copy.created_by;
        return copy;
      }),
      shopping_list: shopping.filter((entry) => entry.state !== 'removido'),
    },
    null,
    2,
  );
}

export async function downloadMyData(): Promise<void> {
  if (!currentUser()) {
    save(await localExport());
    return;
  }
  let res: Response;
  try {
    res = await fetch('/api/account/export');
  } catch {
    throw new ApiError('Sem ligação à internet. Tenta mais tarde.');
  }
  if (!res.ok) throw new ApiError('Não foi possível preparar o ficheiro. Tenta outra vez.');
  save(JSON.stringify(await res.json(), null, 2));
}

/** Without an account: everything on this phone goes, and the app starts over. */
export async function eraseThisDevice(): Promise<void> {
  await clearCopy(db);
  forgetStarted();
}
