// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Today's use of the account from the Cloudflare GraphQL Analytics API, with a read-only token
 * ("Account Analytics: Read", secret CF_ANALYTICS_TOKEN; free). Adapted from Prazómetro
 * (workers/monitor/src/analytics.ts). The daily limits count the whole account.
 */
import type { Metric } from './limits';

const ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';

const QUERY = `query Usage($account: string!, $date: Date!, $since: Date!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      workers: workersInvocationsAdaptive(limit: 1000, filter: { date_geq: $date, date_leq: $date }) {
        sum { requests }
      }
      d1: d1AnalyticsAdaptiveGroups(limit: 1000, filter: { date_geq: $date, date_leq: $date }) {
        sum { rowsRead rowsWritten }
      }
      storage: d1StorageAdaptiveGroups(limit: 1000, filter: { date_geq: $since }) {
        max { databaseSizeBytes }
        dimensions { date databaseId }
      }
    }
  }
}`;

interface AnalyticsResponse {
  data?: {
    viewer: {
      accounts: {
        workers: { sum: { requests: number } }[];
        d1: { sum: { rowsRead: number; rowsWritten: number } }[];
        storage: {
          max: { databaseSizeBytes: number };
          dimensions: { date: string; databaseId: string };
        }[];
      }[];
    };
  };
  errors?: { message: string }[] | null;
}

export class AnalyticsError extends Error {}

const daysBefore = (date: string, days: number) =>
  new Date(Date.parse(date) - days * 86_400_000).toISOString().slice(0, 10);

export async function readAnalytics(
  options: { token: string; accountId: string; databaseId: string; date: string },
  fetcher: typeof fetch = fetch,
): Promise<Partial<Record<Metric, number>>> {
  const res = await fetcher(ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${options.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      query: QUERY,
      variables: {
        account: options.accountId,
        date: options.date,
        since: daysBefore(options.date, 3),
      },
    }),
  });
  if (!res.ok) throw new AnalyticsError(`HTTP ${res.status}`);
  const json = (await res.json()) as AnalyticsResponse;
  const account = json.data?.viewer.accounts[0];
  if (json.errors?.length || !account) {
    throw new AnalyticsError(json.errors?.[0]?.message ?? 'answer without data');
  }

  // The latest size of each database; the account adds them all up.
  const latest = new Map<string, { date: string; size: number }>();
  for (const row of account.storage) {
    const previous = latest.get(row.dimensions.databaseId);
    if (!previous || row.dimensions.date >= previous.date) {
      latest.set(row.dimensions.databaseId, {
        date: row.dimensions.date,
        size: row.max.databaseSizeBytes,
      });
    }
  }
  const values: Partial<Record<Metric, number>> = {
    workers_requests: account.workers.reduce((sum, row) => sum + row.sum.requests, 0),
    d1_rows_read: account.d1.reduce((sum, row) => sum + row.sum.rowsRead, 0),
    d1_rows_written: account.d1.reduce((sum, row) => sum + row.sum.rowsWritten, 0),
  };
  if (latest.size) {
    values.account_d1_size = [...latest.values()].reduce((sum, row) => sum + row.size, 0);
    const own = latest.get(options.databaseId);
    if (own) values.d1_size = own.size;
  }
  return values;
}
