// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared by the route tests: a browser that keeps its cookie, accounts and items.
import { env } from 'cloudflare:workers';
import { expect } from 'vitest';
import { app } from '../src/worker/app';

const ORIGIN = 'http://localhost';

/** A tiny browser: keeps the session cookie between requests. */
export class Browser {
  cookie = '';

  async request(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const res = await app.request(
      path,
      {
        method,
        headers: {
          origin: ORIGIN,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(this.cookie ? { cookie: this.cookie } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      env,
    );
    const set = res.headers.get('set-cookie');
    if (set) {
      const pair = set.split(';')[0]!;
      this.cookie = pair.endsWith('=') ? '' : pair;
    }
    return res;
  }

  async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    return (await (await this.request(method, path, body)).json()) as T;
  }
}

export interface Me {
  user: { email: string; household: { id: string; name: string } } | null;
}

export const PASSWORD = 'uma palavra-passe longa';

export async function signUp(email: string): Promise<Browser> {
  const browser = new Browser();
  const res = await browser.request('POST', '/api/auth/register', { email, password: PASSWORD });
  expect(res.status).toBe(201);
  return browser;
}

export function newItem(name: string, overrides: Record<string, unknown> = {}) {
  const at = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    category: null,
    location: 'frigorifico',
    ean: null,
    quantity: null,
    unit: null,
    purchased_at: at,
    opened_at: null,
    expires_at: '2026-11-12',
    expiry_source: 'estimada',
    status: 'ativo',
    resolved_at: null,
    created_at: at,
    updated_at: at,
    ...overrides,
  };
}
