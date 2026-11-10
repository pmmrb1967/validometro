// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * What the admin panel follows, and the Cloudflare free-plan limits (CLAUDE.md, "Limites do
 * plano gratuito"). Adapted from Prazómetro (workers/monitor/src/limits.ts). Shared by the
 * hourly monitor (monitor.ts), which records and warns, and the panel (admin.ts).
 */
import { FREE_NEURONS_PER_DAY } from './usage';

const MB = 1024 * 1024;

export const METRIC_IDS = [
  'workers_requests',
  'd1_rows_read',
  'd1_rows_written',
  'd1_size',
  'account_d1_size',
  'ai_neurons',
  'ai_calls',
  'users',
  'households',
  'active_users',
] as const;
export type Metric = (typeof METRIC_IDS)[number];

export interface MetricInfo {
  label: string;
  unit: 'count' | 'bytes';
  /** The free-plan limit; without one, the metric is only shown. */
  limit?: number;
  /** Daily limits reset at 00:00 UTC; storage ones do not. */
  daily?: boolean;
  /** Read from the Cloudflare GraphQL Analytics API (needs CF_ANALYTICS_TOKEN). */
  analytics?: boolean;
}

export const METRICS: Record<Metric, MetricInfo> = {
  workers_requests: {
    label: 'Pedidos ao Worker',
    unit: 'count',
    limit: 100_000,
    daily: true,
    analytics: true,
  },
  d1_rows_read: {
    label: 'Linhas lidas na D1',
    unit: 'count',
    limit: 5_000_000,
    daily: true,
    analytics: true,
  },
  d1_rows_written: {
    label: 'Linhas escritas na D1',
    unit: 'count',
    limit: 100_000,
    daily: true,
    analytics: true,
  },
  d1_size: { label: 'Tamanho da base D1', unit: 'bytes', limit: 500 * MB },
  account_d1_size: {
    label: 'D1 em toda a conta',
    unit: 'bytes',
    limit: 5 * 1024 * MB,
    analytics: true,
  },
  ai_neurons: {
    label: 'Neurons da Workers AI',
    unit: 'count',
    limit: FREE_NEURONS_PER_DAY,
    daily: true,
  },
  ai_calls: { label: 'Leituras por IA (todas)', unit: 'count', daily: true },
  users: { label: 'Contas', unit: 'count' },
  households: { label: 'Casas', unit: 'count' },
  active_users: { label: 'Pessoas ativas (7 dias)', unit: 'count' },
};

/** Warning thresholds, in percent of the limit. */
export const THRESHOLDS = [70, 90] as const;

/** UTC day (YYYY-MM-DD) of an instant. */
export const utcDate = (now: Date) => now.toISOString().slice(0, 10);

export function percentOf(metric: Metric, value: number): number | null {
  const limit = METRICS[metric].limit;
  return limit ? (value / limit) * 100 : null;
}

/** "45,2 MB", "1 234": for the warning text (the panel formats on the client). */
export function formatValue(metric: Metric, value: number): string {
  if (METRICS[metric].unit === 'bytes') {
    return `${(value / MB).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} MB`;
  }
  return value.toLocaleString('pt-PT');
}
