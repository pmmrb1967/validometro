// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The admin panel (/admin, only for ADMIN_EMAILS): how much of the Cloudflare free plan the app
 * uses today, how many people use it, and the AI by provider. Nothing about what is in anyone's
 * fridge. The hourly watch (src/worker/monitor.ts) warns the admins' phones at 70% and 90%.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { costUsd, formatCount, formatUsd, MODEL_LABELS } from '../../domain/ai-cost';
import { call, useAccount } from '../account';

interface Metric {
  id: string;
  label: string;
  unit: 'count' | 'bytes';
  limit?: number;
  daily?: boolean;
  analytics?: boolean;
  value: number | null;
}

interface Overview {
  date: string;
  analytics: boolean;
  analyticsError: string | null;
  metrics: Metric[];
  history: { date: string; metric: string; value: number }[];
  ai: {
    provider: string;
    model: string | null;
    operation: string;
    calls: number;
    failures: number;
    units: number;
    input: number;
    output: number;
    /** Calls from before the tokens were kept apart (0.10): counted, not priced. */
    unpriced: number;
  }[];
  alerts: { date: string; metric: string; threshold: number; value: number; sent_at: number }[];
  adminPhones: number;
}

const NUMBER = new Intl.NumberFormat('pt-PT');
const MB = 1024 * 1024;

function format(unit: Metric['unit'], value: number): string {
  if (unit === 'bytes') {
    return `${(value / MB).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} MB`;
  }
  return NUMBER.format(value);
}

const PROVIDERS: Record<string, string> = {
  'workers-ai': 'Workers AI',
  gemini: 'Gemini (chave própria)',
  anthropic: 'Claude (chave própria)',
};

type AiRow = Overview['ai'][number];

function providerLabel(row: AiRow): string {
  if (row.provider === 'workers-ai' || !row.model) return PROVIDERS[row.provider] ?? row.provider;
  return `${MODEL_LABELS[row.model] ?? row.model} (chave própria)`;
}

/** US$ of the priced calls, or null when none could be priced. */
function rowCost(row: AiRow): number | null {
  if (row.provider === 'workers-ai' || row.input + row.output === 0) return null;
  return costUsd(row.model, { input: row.input, output: row.output });
}

function spentText(row: AiRow): string {
  if (row.provider === 'workers-ai') return `${NUMBER.format(row.units)} neurons`;
  const usd = rowCost(row);
  if (usd === null) return '—';
  return `≈ ${formatUsd(usd)}${row.unpriced ? '*' : ''}`;
}

const OPERATIONS: Record<string, string> = {
  receipt: 'Talões',
  voice: 'Voz',
  date: 'Datas',
  recipes: 'Receitas',
  test: 'Teste da chave',
};

/** The daily metrics shown in the history table, in this order. */
const HISTORY = ['workers_requests', 'd1_rows_read', 'd1_rows_written', 'ai_neurons'] as const;

const SHORT: Record<(typeof HISTORY)[number], string> = {
  workers_requests: 'Pedidos',
  d1_rows_read: 'Lidas',
  d1_rows_written: 'Escritas',
  ai_neurons: 'Neurons',
};

function level(percent: number): { className: string; text: string } {
  if (percent >= 90) return { className: 'limit-critical', text: 'Perto do limite' };
  if (percent >= 70) return { className: 'limit-warning', text: 'Atenção' };
  return { className: '', text: '' };
}

function LimitRow({ metric }: { metric: Metric }) {
  const limit = metric.limit ?? 0;
  if (metric.value === null) {
    return (
      <li className="limit-row">
        <div className="limit-head">
          <span>{metric.label}</span>
          <span className="hint">sem dados</span>
        </div>
      </li>
    );
  }
  const percent = limit ? (metric.value / limit) * 100 : 0;
  const state = level(percent);
  return (
    <li className={`limit-row ${state.className}`}>
      <div className="limit-head">
        <span>{metric.label}</span>
        <span className="limit-value">
          {format(metric.unit, metric.value)} <small>de {format(metric.unit, limit)}</small>
        </span>
      </div>
      <div
        className="limit-track"
        role="meter"
        aria-label={metric.label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={metric.value}
      >
        <span className="limit-bar" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <p className="limit-note">
        {NUMBER.format(Math.round(percent))}% {metric.daily ? 'de hoje' : 'do total'}
        {state.text && (
          <>
            . <strong>{state.text}</strong>
          </>
        )}
      </p>
    </li>
  );
}

function shortDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

export function Admin() {
  const account = useAccount();
  const isAdmin = account.status === 'ready' && account.me?.admin === true;
  const [overview, setOverview] = useState<Overview>();
  const [error, setError] = useState<string>();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<string>();

  const load = useCallback(async () => {
    try {
      setOverview(await call<Overview>('GET', '/api/admin/overview'));
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo correu mal.');
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    call<Overview>('GET', '/api/admin/overview')
      .then((next) => live && setOverview(next))
      .catch((err: unknown) => live && setError(err instanceof Error ? err.message : 'Erro.'));
    return () => {
      live = false;
    };
  }, [isAdmin]);

  if (account.status === 'loading') return null;
  if (!isAdmin) {
    return (
      <div className="admin">
        <h1 className="page-title">Painel</h1>
        <p className="nothing">Esta página é só para quem administra a app.</p>
        <Link className="button secondary" to="/">
          Voltar
        </Link>
      </div>
    );
  }

  const check = async () => {
    setChecking(true);
    setChecked(undefined);
    try {
      const result = await call<{ alerts: unknown[]; pushed: number }>(
        'POST',
        '/api/admin/monitor',
        {},
      );
      setChecked(
        result.alerts.length
          ? `${result.alerts.length} ${result.alerts.length === 1 ? 'aviso novo' : 'avisos novos'}, enviado para ${result.pushed} ${result.pushed === 1 ? 'telemóvel' : 'telemóveis'}.`
          : 'Nenhum limite novo ultrapassado.',
      );
      await load();
    } catch (err) {
      setChecked(err instanceof Error ? err.message : 'Algo correu mal.');
    } finally {
      setChecking(false);
    }
  };

  const limits = overview?.metrics.filter((metric) => metric.limit) ?? [];
  const people = overview?.metrics.filter((metric) =>
    ['users', 'households', 'active_users'].includes(metric.id),
  );
  const labels = new Map(overview?.metrics.map((metric) => [metric.id, metric.label]));
  const neurons = overview?.metrics.find((metric) => metric.id === 'ai_neurons');
  const keyCost = (overview?.ai ?? []).reduce((sum, row) => sum + (rowCost(row) ?? 0), 0);
  const days = [...new Set(overview?.history.map((row) => row.date))].reverse();
  const historyValue = (date: string, metric: string) =>
    overview?.history.find((row) => row.date === date && row.metric === metric)?.value;

  return (
    <div className="admin">
      <h1 className="page-title">Painel</h1>
      {error && (
        <p className="note error" role="alert">
          {error}
        </p>
      )}
      {overview && (
        <>
          <p className="hint">
            Hoje é {overview.date} em UTC: os limites diários recomeçam às 00:00 UTC (01:00 em
            Lisboa no inverno).
          </p>

          {!overview.analytics && (
            <p className="notice">
              Os pedidos ao Worker e as linhas da D1 precisam de um token da Cloudflare só de
              leitura (“Account Analytics: Read”), no segredo <code>CF_ANALYTICS_TOKEN</code>.
            </p>
          )}
          {overview.analyticsError && (
            <p className="notice">
              Não foi possível ler as estatísticas da Cloudflare ({overview.analyticsError}).
              Confirma o token.
            </p>
          )}
          {overview.adminPhones === 0 && (
            <p className="notice">
              Os avisos de limite (70% e 90%) chegam por notificação. Liga o alerta diário neste
              telemóvel, em <Link to="/definicoes">Definições</Link>, para os receberes.
            </p>
          )}

          <section className="card">
            <h2>Plano gratuito</h2>
            <ul className="limits">
              {limits.map((metric) => (
                <LimitRow key={metric.id} metric={metric} />
              ))}
            </ul>
            <div className="row wrap">
              <button
                type="button"
                className="secondary"
                disabled={checking}
                onClick={() => void check()}
              >
                {checking ? 'A verificar…' : 'Verificar limites agora'}
              </button>
            </div>
            {checked && (
              <p className="hint" role="status">
                {checked}
              </p>
            )}
          </section>

          <section className="card">
            <h2>Quem usa</h2>
            <dl className="admin-tiles">
              {people?.map((metric) => (
                <div key={metric.id}>
                  <dt>{metric.label}</dt>
                  <dd>{metric.value === null ? '—' : NUMBER.format(metric.value)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card">
            <h2>IA nos últimos 7 dias</h2>
            {overview.ai.length === 0 ? (
              <p className="hint">Nenhuma leitura por IA.</p>
            ) : (
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th scope="col">Fornecedor</th>
                      <th scope="col">Uso</th>
                      <th scope="col">Pedidos</th>
                      <th scope="col">Falhas</th>
                      <th scope="col">Gasto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.ai.map((row) => (
                      <tr key={`${row.provider}-${row.model}-${row.operation}`}>
                        <td>{providerLabel(row)}</td>
                        <td>{OPERATIONS[row.operation] ?? row.operation}</td>
                        <td>{NUMBER.format(row.calls)}</td>
                        <td>{NUMBER.format(row.failures)}</td>
                        <td>{spentText(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {keyCost > 0 && (
              <p className="admin-total">
                Chaves próprias, 7 dias: <strong>≈ {formatUsd(keyCost)}</strong>, pagos por quem tem
                a chave.
              </p>
            )}
            {neurons && neurons.value !== null && neurons.limit && (
              <p className="admin-total">
                Workers AI hoje: restam{' '}
                <strong>
                  ≈ {formatCount(Math.max(0, neurons.limit - neurons.value))} de{' '}
                  {formatCount(neurons.limit)} neurons
                </strong>
                .
              </p>
            )}
            <p className="hint">
              Os 10 000 neurons diários são a parte gratuita da conta Cloudflare (a mesma no plano
              Free e no pago; acima disso só se paga no plano pago, a 0,011 US$ por 1000), e
              recomeçam às 00:00 UTC. A app conta-os ela própria, pelos tokens de cada pedido. Os
              custos em US$ são estimativas pelos preços de tabela
              {overview.ai.some((row) => row.unpriced > 0) &&
                '; * há pedidos antigos sem o detalhe dos tokens, que não entram no custo'}
              .
            </p>
          </section>

          <section className="card">
            <h2>Últimos 14 dias</h2>
            {days.length === 0 ? (
              <p className="hint">O registo começa na próxima hora certa.</p>
            ) : (
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th scope="col">Dia</th>
                      {HISTORY.map((metric) => (
                        <th key={metric} scope="col" title={labels.get(metric)}>
                          {SHORT[metric]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((date) => (
                      <tr key={date}>
                        <th scope="row">{shortDate(date)}</th>
                        {HISTORY.map((metric) => {
                          const value = historyValue(date, metric);
                          return (
                            <td key={metric}>{value === undefined ? '—' : NUMBER.format(value)}</td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <h2>Avisos enviados</h2>
            {overview.alerts.length === 0 ? (
              <p className="hint">Nenhum limite chegou aos 70%.</p>
            ) : (
              <ul className="admin-alerts">
                {overview.alerts.map((alert) => (
                  <li key={`${alert.date}-${alert.metric}-${alert.threshold}`}>
                    <span>{shortDate(alert.date)}</span>{' '}
                    {alert.metric === 'monitor'
                      ? 'Estatísticas da Cloudflare indisponíveis'
                      : `${labels.get(alert.metric) ?? alert.metric}: ${alert.threshold}%`}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
