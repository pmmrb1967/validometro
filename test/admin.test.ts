// SPDX-License-Identifier: AGPL-3.0-or-later
// The admin panel and the hourly free-plan watch (src/worker/admin.ts, monitor.ts).
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pushDeps } from '../src/worker/alerts';
import { toBase64Url } from '../src/worker/base64url';
import { monitorDeps, runMonitor } from '../src/worker/monitor';
import { recordUsage } from '../src/worker/usage';
import { Browser, signUp } from './helpers';

// vitest.config.ts: ADMIN_EMAILS = admin@example.pt
const ADMIN = 'admin@example.pt';

interface Overview {
  analytics: boolean;
  metrics: { id: string; value: number | null; limit?: number }[];
  ai: { provider: string; operation: string; calls: number; failures: number; units: number }[];
  alerts: { metric: string; threshold: number }[];
  adminPhones: number;
}

const value = (overview: Overview, id: string) => overview.metrics.find((m) => m.id === id)?.value;

async function vapidEnv(): Promise<Env> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
  ])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  return { ...env, VAPID_PUBLIC_KEY: toBase64Url(raw), VAPID_PRIVATE_KEY: jwk.d! };
}

async function deviceKeys() {
  const device = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  return {
    p256dh: toBase64Url(
      new Uint8Array((await crypto.subtle.exportKey('raw', device.publicKey)) as ArrayBuffer),
    ),
    auth: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
  };
}

// The database lasts for the whole file: each test starts from no one.
beforeEach(async () => {
  await env.DB.batch(
    [
      'push_subscriptions',
      'household_members',
      'users',
      'households',
      'ai_usage',
      'usage_daily',
      'limit_alerts',
    ].map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
  );
});

afterEach(() => {
  pushDeps.fetcher = undefined;
  monitorDeps.analyticsFetcher = undefined;
});

describe('admin panel', () => {
  it('is only for the administrators', async () => {
    expect((await new Browser().request('GET', '/api/admin/overview')).status).toBe(401);

    const someone = await signUp('alguem@example.pt');
    expect((await someone.request('GET', '/api/admin/overview')).status).toBe(404);
    expect(
      (await someone.json<{ user: { admin: boolean } }>('GET', '/api/auth/me')).user.admin,
    ).toBe(false);

    const admin = await signUp(ADMIN);
    expect((await admin.json<{ user: { admin: boolean } }>('GET', '/api/auth/me')).user.admin).toBe(
      true,
    );
    expect(
      (await admin.request('POST', '/api/admin/monitor', {}, { origin: 'https://evil.example' }))
        .status,
    ).toBe(403);
  });

  it('shows the use of the free plan, the AI by provider and the people', async () => {
    const admin = await signUp(ADMIN);
    await signUp('outra@example.pt');
    // Opening the app (GET /auth/me) marks the day; the other account has not opened it yet.
    await admin.request('GET', '/api/auth/me');
    await recordUsage(env.DB, 'workers-ai', 'receipt', 120, true);
    await recordUsage(env.DB, 'workers-ai', 'receipt', 0, false);
    await recordUsage(env.DB, 'gemini', 'voice', 0, true);

    const overview = await admin.json<Overview>('GET', '/api/admin/overview');
    expect(overview.analytics).toBe(false);
    expect(value(overview, 'users')).toBe(2);
    expect(value(overview, 'households')).toBe(2);
    expect(value(overview, 'active_users')).toBe(1);
    expect(value(overview, 'ai_neurons')).toBe(120);
    expect(value(overview, 'ai_calls')).toBe(3);
    expect(value(overview, 'd1_size')).toBeGreaterThan(0);
    // Without the token, the analytics metrics are unknown, not zero.
    expect(value(overview, 'workers_requests')).toBeNull();
    expect(overview.ai).toContainEqual({
      provider: 'workers-ai',
      operation: 'receipt',
      calls: 2,
      failures: 1,
      units: 120,
    });
    expect(overview.adminPhones).toBe(0);
  });
});

describe('free-plan watch', () => {
  it('warns the admins at 70% and 90%, once per threshold and day', async () => {
    const admin = await signUp(ADMIN);
    const endpoint = 'https://fcm.googleapis.com/fcm/send/admin';
    expect(
      (await admin.request('PUT', '/api/push/subscription', { endpoint, keys: await deviceKeys() }))
        .status,
    ).toBe(204);
    const someone = await signUp('alguem@example.pt');
    await someone.request('PUT', '/api/push/subscription', {
      endpoint: 'https://fcm.googleapis.com/fcm/send/other',
      keys: await deviceKeys(),
    });
    const keys = await vapidEnv();
    const posted: string[] = [];
    pushDeps.fetcher = async (url) => {
      posted.push(url);
      return { status: 201 };
    };

    const now = new Date();
    expect((await runMonitor(keys, now)).alerts).toEqual([]);

    await recordUsage(env.DB, 'workers-ai', 'receipt', 7_500, true);
    let result = await runMonitor(keys, now);
    expect(result.alerts).toEqual([{ metric: 'ai_neurons', threshold: 70, value: 7_500 }]);
    expect(result.pushed).toBe(1);
    expect(posted).toEqual([endpoint]);

    // The next hour, the same use: nothing new.
    result = await runMonitor(keys, now);
    expect(result.alerts).toEqual([]);

    await recordUsage(env.DB, 'workers-ai', 'receipt', 2_000, true);
    result = await runMonitor(keys, now);
    expect(result.alerts).toEqual([{ metric: 'ai_neurons', threshold: 90, value: 9_500 }]);
    expect(posted).toHaveLength(2);

    const stored = await env.DB.prepare(
      "SELECT value FROM usage_daily WHERE metric = 'ai_neurons'",
    ).first<{ value: number }>();
    expect(stored?.value).toBe(9_500);
    const overview = await admin.json<Overview>('GET', '/api/admin/overview');
    expect(overview.alerts.map((a) => a.threshold)).toEqual([90, 70]);
    expect(overview.adminPhones).toBe(1);
  });

  it('reads the Cloudflare analytics with the token, and warns when it cannot', async () => {
    const withToken = { ...env, CF_ANALYTICS_TOKEN: 'token' };
    let sent: { variables: { account: string; date: string } } | undefined;
    monitorDeps.analyticsFetcher = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string);
      return Response.json({
        data: {
          viewer: {
            accounts: [
              {
                workers: [{ sum: { requests: 80_000 } }],
                d1: [{ sum: { rowsRead: 1_000, rowsWritten: 50 } }],
                storage: [
                  {
                    max: { databaseSizeBytes: 2_000_000 },
                    dimensions: {
                      date: '2026-11-09',
                      databaseId: '0916b1e9-1569-42f6-b23f-73f22422be6e',
                    },
                  },
                  {
                    max: { databaseSizeBytes: 500_000 },
                    dimensions: { date: '2026-11-09', databaseId: 'other' },
                  },
                ],
              },
            ],
          },
        },
      });
    }) as typeof fetch;
    const now = new Date('2026-11-10T12:00:00Z');
    let result = await runMonitor(withToken, now);
    expect(sent?.variables).toMatchObject({
      account: '3c37a84e831f214acafff4873b338bba',
      date: '2026-11-10',
    });
    expect(result.values).toMatchObject({
      workers_requests: 80_000,
      d1_rows_read: 1_000,
      d1_rows_written: 50,
      d1_size: 2_000_000,
      account_d1_size: 2_500_000,
    });
    expect(result.alerts).toEqual([{ metric: 'workers_requests', threshold: 70, value: 80_000 }]);

    monitorDeps.analyticsFetcher = (async () =>
      new Response('no', { status: 403 })) as typeof fetch;
    result = await runMonitor(withToken, now);
    expect(result.analyticsError).toBe('HTTP 403');
    expect(result.alerts).toEqual([{ metric: 'monitor', threshold: 0, value: 0 }]);
    // D1's own size stands in.
    expect(result.values.d1_size).toBeGreaterThan(0);
  });
});
