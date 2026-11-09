// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { lisbonDate } from '../../domain/dates';
import { bySoonest, light, type Light, type LitItem } from '../../domain/traffic-light';
import {
  IN_LOCATION,
  LOCATION_LABELS,
  LOCATIONS,
  type Item,
  type Location,
} from '../../domain/types';
import { InstallSection } from '../components/InstallSection';
import { ItemCard } from '../components/ItemCard';
import { LogoMark } from '../Logo';
import { activeItems, markOpened, reactivateItem, resolveItem, setExpiry } from '../store/items';

type Filter = Location | 'tudo';

const GROUPS: { light: Light; title: string; hint: string }[] = [
  { light: 'red', title: 'Usar já', hint: 'Expira em 2 dias ou menos' },
  { light: 'amber', title: 'Esta semana', hint: 'Expira em 3 a 7 dias' },
  { light: 'green', title: 'Com tempo', hint: 'Mais de uma semana' },
];

interface Undo {
  id: string;
  text: string;
}

/** The traffic light: what to use first, grouped by how soon it expires. */
export function Home() {
  const items = useLiveQuery(() => activeItems(), []);
  const [filter, setFilter] = useState<Filter>('tudo');
  const [showLongLife, setShowLongLife] = useState(false);
  const [undo, setUndo] = useState<Undo>();
  const today = lisbonDate(new Date());

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(undefined), 6000);
    return () => clearTimeout(timer);
  }, [undo]);

  const lit = useMemo(
    () => (items ?? []).map((item) => light(item, today)).sort(bySoonest),
    [items, today],
  );
  const inPlace = lit.filter((entry) => filter === 'tudo' || entry.item.location === filter);
  const longLife = inPlace.filter((entry) => entry.longLife);

  if (items === undefined) return null;
  if (items.length === 0) return <Empty />;

  const resolve = (item: Item, status: 'consumido' | 'deitado_fora') => {
    void resolveItem(item.id, status);
    setUndo({
      id: item.id,
      text: `${item.name}: ${status === 'consumido' ? 'comido' : 'deitado fora'}.`,
    });
  };

  const card = (entry: LitItem) => (
    <ItemCard
      key={entry.item.id}
      lit={entry}
      actions={{
        onEaten: () => resolve(entry.item, 'consumido'),
        onThrownAway: () => resolve(entry.item, 'deitado_fora'),
        onOpened: () => void markOpened(entry.item.id),
        onDate: (date) => void setExpiry(entry.item.id, date),
      }}
    />
  );

  return (
    <div className="home">
      <div className="filters" role="group" aria-label="Onde">
        {(['tudo', ...LOCATIONS] as const).map((place) => (
          <button
            key={place}
            type="button"
            className="chip"
            aria-pressed={filter === place}
            onClick={() => setFilter(place)}
          >
            {place === 'tudo' ? 'Tudo' : LOCATION_LABELS[place]}
          </button>
        ))}
      </div>

      {GROUPS.map((group) => {
        const entries = inPlace.filter((entry) => !entry.longLife && entry.light === group.light);
        if (entries.length === 0) return null;
        return (
          <section key={group.light} className={`group group-${group.light}`}>
            <h2>
              {group.title} <span className="count">{entries.length}</span>
            </h2>
            <p className="hint">{group.hint}</p>
            <ul className="items">{entries.map(card)}</ul>
          </section>
        );
      })}

      {inPlace.length === longLife.length && !showLongLife && (
        <p className="nothing">
          {filter === 'tudo'
            ? 'Nada a expirar por agora.'
            : `Nada a expirar ${IN_LOCATION[filter]}.`}
        </p>
      )}

      {longLife.length > 0 && (
        <section className="group group-long">
          <button
            type="button"
            className="ghost"
            aria-expanded={showLongLife}
            onClick={() => setShowLongLife((open) => !open)}
          >
            {showLongLife ? 'Esconder' : 'Mostrar'} longa duração ({longLife.length})
          </button>
          {showLongLife && <ul className="items">{longLife.map(card)}</ul>}
        </section>
      )}

      <Link to="/adicionar" className="fab">
        Adicionar
      </Link>

      {undo && (
        <div className="snackbar" role="status">
          <span>{undo.text}</span>
          <button
            type="button"
            className="ghost on-dark"
            onClick={() => {
              void reactivateItem(undo.id);
              setUndo(undefined);
            }}
          >
            Anular
          </button>
        </div>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="empty-wrap">
      <section className="empty" aria-labelledby="empty-title">
        <div className="empty-mark">
          <LogoMark size={116} />
        </div>
        <h2 id="empty-title">Ainda não há nada registado</h2>
        <p>Regista o que trouxeste das compras e o Validómetro avisa o que usar primeiro.</p>
        <Link to="/adicionar" className="button primary">
          Adicionar alimento
        </Link>
      </section>
      <InstallSection />
    </div>
  );
}
