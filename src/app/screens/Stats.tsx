// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Waste, simply: the last six months' items thrown away (one bar per month, with the
 * number written), out of everything that ended; and the categories thrown away most.
 * Above it, what was spent (the receipts read and the prices typed): the waste's yardstick.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { lisbonDate } from '../../domain/dates';
import { monthlySpending } from '../../domain/spending';
import { formatEuros, wasteStats } from '../../domain/stats';
import { db } from '../store/items';

const MONTH = new Intl.DateTimeFormat('pt-PT', { month: 'short', timeZone: 'UTC' });
const LONG_MONTH = new Intl.DateTimeFormat('pt-PT', { month: 'long', timeZone: 'UTC' });

function monthLabel(month: string): string {
  return MONTH.format(new Date(`${month}-01T00:00:00Z`)).replace('.', '');
}

function counted(receipts: number, loose: number): string {
  const parts = [
    receipts ? (receipts === 1 ? '1 talão' : `${receipts} talões`) : null,
    loose ? (loose === 1 ? '1 alimento sem talão' : `${loose} alimentos sem talão`) : null,
  ].filter(Boolean);
  return parts.join(' e ');
}

export function Stats() {
  const items = useLiveQuery(() => db.items.toArray(), []);
  const receipts = useLiveQuery(() => db.receipts.toArray(), []);
  const today = lisbonDate(new Date());
  const stats = useMemo(
    () =>
      items
        ? wasteStats(
            items.filter((item) => item.status !== 'ativo'),
            today,
          )
        : undefined,
    [items, today],
  );
  const spending = useMemo(
    () => (items && receipts ? monthlySpending(receipts, items, today) : undefined),
    [items, receipts, today],
  );
  if (!stats || !spending) return null;
  const thisMonth = spending.months.at(-1)!;
  const maxSpent = Math.max(1, ...spending.months.map((month) => month.euros));
  const wastedShare =
    spending.euros > 0 && stats.wastedEuros > 0
      ? Math.max(1, Math.round((stats.wastedEuros / spending.euros) * 100))
      : null;

  const total = stats.eaten + stats.wasted;
  const share = total ? Math.round((stats.wasted / total) * 100) : 0;
  const maxMonth = Math.max(1, ...stats.months.map((month) => month.wasted));
  const maxCategory = Math.max(1, ...stats.categories.map((category) => category.wasted));

  return (
    <div className="stats">
      <h1 className="page-title">Desperdício</h1>

      {spending.euros > 0 && (
        <section className="card stat-spending">
          <h2>Gasto em compras</h2>
          <p className="stat-number">{formatEuros(thisMonth.euros)}</p>
          <p className="hint">
            em {LONG_MONTH.format(new Date(`${thisMonth.month}-01T00:00:00Z`))}
            {thisMonth.euros > 0 && `, de ${counted(thisMonth.receipts, thisMonth.loose)}`}.
            {wastedShare !== null &&
              ` Nos últimos 6 meses, ${formatEuros(stats.wastedEuros)} foram para o lixo: ${wastedShare}% do que se gastou.`}
          </p>
          <ul className="bars" aria-label="Gasto em compras por mês">
            {spending.months.map((month) => (
              <li
                key={month.month}
                className="bar-row"
                title={`${monthLabel(month.month)}: ${formatEuros(month.euros)}`}
              >
                <span className="bar-label">{monthLabel(month.month)}</span>
                <span className="bar-track">
                  {month.euros > 0 && (
                    <span className="bar" style={{ width: `${(month.euros / maxSpent) * 100}%` }} />
                  )}
                </span>
                <span className="bar-value">
                  {month.euros > 0 ? formatEuros(month.euros) : '–'}
                </span>
              </li>
            ))}
          </ul>
          <p className="hint">
            Conta os talões lidos na app (o total, com o que não é comida) e os preços escritos à
            mão nas compras sem talão. As outras compras não aparecem aqui.
          </p>
        </section>
      )}

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

          {stats.priced > 0 && (
            <section className="card stat-euros">
              <h2>Em dinheiro</h2>
              <p className="stat-number">{formatEuros(stats.wastedEuros)}</p>
              <p className="hint">
                deitados fora nos últimos 6 meses
                {stats.eatenEuros > 0 && `, e ${formatEuros(stats.eatenEuros)} aproveitados`}. Conta
                só os alimentos com preço ({stats.priced} de {total}): os que vieram do talão ou a
                que escreveste o preço.
              </p>
            </section>
          )}

          <section className="card">
            <h2>Deitados fora por mês</h2>
            <ul className="bars" aria-label="Alimentos deitados fora por mês">
              {stats.months.map((month) => (
                <li
                  key={month.month}
                  className="bar-row"
                  title={`${monthLabel(month.month)}: ${month.wasted} deitados fora${month.wastedEuros > 0 ? ` (${formatEuros(month.wastedEuros)})` : ''}, ${month.eaten} comidos`}
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
