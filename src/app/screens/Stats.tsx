// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Waste, simply: the last six months' items thrown away (one bar per month, with the
 * number written), out of everything that ended; and the categories thrown away most.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { lisbonDate } from '../../domain/dates';
import { wasteStats } from '../../domain/stats';
import { db } from '../store/items';

const MONTH = new Intl.DateTimeFormat('pt-PT', { month: 'short', timeZone: 'UTC' });

function monthLabel(month: string): string {
  return MONTH.format(new Date(`${month}-01T00:00:00Z`)).replace('.', '');
}

export function Stats() {
  const resolved = useLiveQuery(() => db.items.where('status').notEqual('ativo').toArray(), []);
  const stats = useMemo(
    () => (resolved ? wasteStats(resolved, lisbonDate(new Date())) : undefined),
    [resolved],
  );
  if (!stats) return null;

  const total = stats.eaten + stats.wasted;
  const share = total ? Math.round((stats.wasted / total) * 100) : 0;
  const maxMonth = Math.max(1, ...stats.months.map((month) => month.wasted));
  const maxCategory = Math.max(1, ...stats.categories.map((category) => category.wasted));

  return (
    <div className="stats">
      <h1 className="page-title">Desperdício</h1>

      {total === 0 ? (
        <p className="nothing">
          Ainda não há nada para contar. Quando marcares alimentos como “Comido” ou “Deitado fora”,
          aparece aqui quanto se aproveita.
        </p>
      ) : (
        <>
          <section className="card stat-hero">
            <p className="stat-number">{share}%</p>
            <p className="hint">
              do que acabou nos últimos 6 meses foi deitado fora: {stats.wasted} de {total}{' '}
              {total === 1 ? 'alimento' : 'alimentos'}. Os outros {stats.eaten} foram comidos.
            </p>
          </section>

          <section className="card">
            <h2>Deitados fora por mês</h2>
            <ul className="bars" aria-label="Alimentos deitados fora por mês">
              {stats.months.map((month) => (
                <li
                  key={month.month}
                  className="bar-row"
                  title={`${monthLabel(month.month)}: ${month.wasted} deitados fora, ${month.eaten} comidos`}
                >
                  <span className="bar-label">{monthLabel(month.month)}</span>
                  <span className="bar-track">
                    {month.wasted > 0 && (
                      <span
                        className="bar"
                        style={{ width: `${(month.wasted / maxMonth) * 100}%` }}
                      />
                    )}
                  </span>
                  <span className="bar-value">
                    {month.wasted}
                    <small> de {month.wasted + month.eaten}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {stats.categories.length > 0 && (
            <section className="card">
              <h2>O que mais vai para o lixo</h2>
              <ul className="bars" aria-label="Tipos de alimento mais deitados fora">
                {stats.categories.map((category) => (
                  <li
                    key={category.label}
                    className="bar-row wide-label"
                    title={`${category.label}: ${category.wasted}`}
                  >
                    <span className="bar-label">{category.label}</span>
                    <span className="bar-track">
                      <span
                        className="bar"
                        style={{ width: `${(category.wasted / maxCategory) * 100}%` }}
                      />
                    </span>
                    <span className="bar-value">{category.wasted}</span>
                  </li>
                ))}
              </ul>
              <p className="hint">Destes, vale a pena comprar menos de cada vez.</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
