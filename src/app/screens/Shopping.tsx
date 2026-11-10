// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The shopping list: what was eaten comes back as a suggestion (one tap to keep it), anyone
 * in the household writes what is missing, and a tap marks it bought. Something thrown away
 * lately gets a gentle note instead of a suggestion: "compraste demais?".
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type FormEvent } from 'react';
import { formatShortDate, lisbonDate } from '../../domain/dates';
import {
  atHome,
  recentlyWasted,
  sameName,
  shoppingOrder,
  wasteHabits,
  type ShoppingEntry,
} from '../../domain/shopping';
import { db } from '../store/items';
import { addToList, clearBought, setShoppingState, shoppingList } from '../store/shopping';

/** "Ainda tens Leite meio-gordo em casa, até 14/11." */
function homeText(name: string, expires: string | null): string {
  return `Ainda tens ${name} em casa${expires ? `, até ${formatShortDate(expires).replace(/\.$/, '')}` : ''}.`;
}

export function Shopping() {
  const list = useLiveQuery(() => shoppingList(), []);
  const wasted = useLiveQuery(
    async () =>
      recentlyWasted(
        await db.items.where('status').equals('deitado_fora').toArray(),
        lisbonDate(new Date()),
      ),
    [],
  );
  const habits = useLiveQuery(
    async () =>
      wasteHabits(
        await db.items.where('status').notEqual('ativo').toArray(),
        lisbonDate(new Date()),
      ),
    [],
  );
  const active = useLiveQuery(() => db.items.where('status').equals('ativo').toArray(), []);
  const [name, setName] = useState('');

  const sorted = useMemo(() => [...(list ?? [])].sort(shoppingOrder), [list]);
  if (list === undefined) return null;
  const suggested = sorted.filter((entry) => entry.state === 'sugerido');
  const toBuy = sorted.filter((entry) => entry.state === 'pendente');
  const bought = sorted.filter((entry) => entry.state === 'comprado');

  const add = (event: FormEvent) => {
    event.preventDefault();
    void addToList(name);
    setName('');
  };

  /** Before buying more: what is still at home, and what tends to end in the bin. */
  const warn = (entry: ShoppingEntry) => {
    const home = entry.state !== 'comprado' ? atHome(entry.name, active ?? []) : undefined;
    const habit = habits?.get(sameName(entry.name));
    return (
      <>
        {home && <small className="home-note">{homeText(home.name, home.expires_at)}</small>}
        {habit ? (
          <small className="waste-note">
            Deitaste fora {habit.wasted} das últimas {habit.ended} vezes: compra menos, ou a
            embalagem pequena.
          </small>
        ) : (
          wasted?.has(sameName(entry.name)) && (
            <small className="waste-note">Deitaste fora há pouco tempo. Compraste demais?</small>
          )
        )}
      </>
    );
  };

  return (
    <div className="shopping">
      <h1 className="page-title">Lista de compras</h1>

      <form className="row add-to-list" onSubmit={add}>
        <input
          aria-label="O que falta comprar"
          className="inline-input"
          placeholder="O que falta? Ex.: leite"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="primary" disabled={!name.trim()}>
          Juntar
        </button>
      </form>

      {suggested.length > 0 && (
        <section className="shopping-group">
          <h2 className="section-title">Acabou. Voltar a comprar?</h2>
          <ul className="shopping-list">
            {suggested.map((entry) => (
              <li key={entry.id} className="shopping-row suggested">
                <span className="shopping-name">
                  {entry.name}
                  {warn(entry)}
                </span>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void setShoppingState(entry.id, 'pendente')}
                >
                  Sim
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void setShoppingState(entry.id, 'removido')}
                >
                  Não
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="shopping-group">
        {toBuy.length === 0 ? (
          <p className="nothing">
            {suggested.length || bought.length
              ? 'Nada mais por comprar.'
              : 'A lista está vazia. Junta o que falta; o que marcares como “Comido” aparece aqui como sugestão.'}
          </p>
        ) : (
          <ul className="shopping-list">
            {toBuy.map((entry) => (
              <li key={entry.id} className="shopping-row">
                <label className="shopping-check">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => void setShoppingState(entry.id, 'comprado')}
                  />
                  <span className="shopping-name">
                    {entry.name}
                    {warn(entry)}
                  </span>
                </label>
                <button
                  type="button"
                  className="ghost"
                  aria-label={`Tirar ${entry.name} da lista`}
                  onClick={() => void setShoppingState(entry.id, 'removido')}
                >
                  Tirar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {bought.length > 0 && (
        <section className="shopping-group">
          <h2 className="section-title">No carrinho</h2>
          <ul className="shopping-list">
            {bought.map((entry) => (
              <li key={entry.id} className="shopping-row done">
                <label className="shopping-check">
                  <input
                    type="checkbox"
                    checked
                    onChange={() => void setShoppingState(entry.id, 'pendente')}
                  />
                  <span className="shopping-name">{entry.name}</span>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" className="ghost" onClick={() => void clearBought()}>
            Limpar comprados
          </button>
        </section>
      )}
    </div>
  );
}
