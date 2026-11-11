// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { usedWord } from '../../domain/consume';
import { formatShortDate, lisbonDate } from '../../domain/dates';
import { canFreeze, frozenDays } from '../../domain/freeze';
import { freezesBadly } from '../../domain/move';
import { offerText } from '../../domain/offer';
import { isOpen, sameName } from '../../domain/shopping';
import { bySoonest, light, type Light, type LitItem } from '../../domain/traffic-light';
import {
  IN_LOCATION,
  LOCATION_LABELS,
  LOCATIONS,
  type Item,
  type Location,
} from '../../domain/types';
import { useAccount } from '../account';
import { InstallSection } from '../components/InstallSection';
import { ItemCard } from '../components/ItemCard';
import { useShowLanding } from '../landing-state';
import { LogoMark } from '../Logo';
import { Landing } from './Landing';
import {
  activeItems,
  freeze,
  markOpened,
  reactivateItem,
  resolveItem,
  restoreItem,
  eatPart,
  moveTo,
  setCategory,
  setExpiry,
  takeOne,
} from '../store/items';
import { addToList, finished, runningLow, shoppingList, takeOffList } from '../store/shopping';
import { recipesPerItem } from '../../domain/recipes';
import { categoryById } from '../../domain/categories';
import { savedRecipes } from '../store/recipes';
import { KitchenView } from '../components/KitchenView';
import { setFoodView, useFoodView, useKitchenLayout } from '../kitchen-layout';

type Filter = Location | 'tudo';

const GROUPS: { light: Light; title: string; hint: string }[] = [
  { light: 'red', title: 'Usar já', hint: 'Expira em 2 dias ou menos' },
  { light: 'amber', title: 'Esta semana', hint: 'Expira em 3 a 7 dias' },
  { light: 'green', title: 'Com tempo', hint: 'Mais de uma semana' },
];

interface Undo {
  id: string;
  text: string;
  /** Undo of "Congelei" or "Abri isto": the item as it was. Else it was resolved. */
  before?: Item;
  /** Any other undo ("Está a acabar", "Acabou"). */
  revert?: () => Promise<void>;
  /** A second button beside "Anular" ("Juntar à lista"). */
  action?: { label: string; run: () => void };
}

/** The phone's share sheet (WhatsApp, SMS…); WhatsApp's link where there is none. */
async function share(text: string): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
    } catch {
      // Closed without sharing: nothing to do.
    }
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

/** The traffic light: what to use first, grouped by how soon it expires. */
export function Home() {
  const items = useLiveQuery(() => activeItems(), []);
  const recipeCounts = useLiveQuery(async () => recipesPerItem(await savedRecipes()), []);
  // What is waiting on the shopping list: a staple there already says "Na lista".
  const listed = useLiveQuery(
    async () =>
      new Set(
        (await shoppingList())
          .filter((entry) => isOpen(entry) && entry.state === 'pendente')
          .map((entry) => sameName(entry.name)),
      ),
    [],
  );
  const [filter, setFilter] = useState<Filter>('tudo');
  const [showLongLife, setShowLongLife] = useState(false);
  const view = useFoodView();
  const layout = useKitchenLayout();
  const [picked, setPicked] = useState<string>();
  const [undo, setUndo] = useState<Undo>();
  const today = lisbonDate(new Date());
  const showLanding = useShowLanding();

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
  const undated = inPlace.filter((entry) => entry.undated);
  const longLife = inPlace.filter((entry) => entry.longLife && !entry.undated);

  // Also after the last item: "Anular" must stay at hand when the list empties.
  const snackbar = undo && (
    <div className="snackbar" role="status">
      <span>{undo.text}</span>
      {undo.action && (
        <button
          type="button"
          className="ghost on-dark"
          onClick={() => {
            undo.action?.run();
            setUndo(undefined);
          }}
        >
          {undo.action.label}
        </button>
      )}
      <button
        type="button"
        className="ghost on-dark"
        onClick={() => {
          void (undo.revert
            ? undo.revert()
            : undo.before
              ? restoreItem(undo.before)
              : reactivateItem(undo.id));
          setUndo(undefined);
        }}
      >
        Anular
      </button>
    </div>
  );

  if (items === undefined || showLanding === undefined) return null;
  // Someone new (no account, nothing here, never started): the landing page.
  if (showLanding) return <Landing />;
  if (items.length === 0) {
    return (
      <>
        <Empty />
        {snackbar}
      </>
    );
  }

  const resolve = (item: Item, status: 'consumido' | 'deitado_fora') => {
    void resolveItem(item.id, status);
    setUndo({
      id: item.id,
      text:
        status === 'consumido'
          ? `${item.name}: ${usedWord(item).toLowerCase()}. Fica sugerido na lista de compras.`
          : `${item.name}: deitado fora. Da próxima vez, comprar menos?`,
    });
  };

  const card = (entry: LitItem) => (
    <ItemCard
      key={entry.item.id}
      lit={entry}
      onList={listed?.has(sameName(entry.item.name)) ?? false}
      recipes={recipeCounts?.get(entry.item.id) ?? 0}
      actions={{
        onEaten: () => resolve(entry.item, 'consumido'),
        onThrownAway: () => resolve(entry.item, 'deitado_fora'),
        onOpened: () => {
          const before = entry.item;
          void markOpened(before.id).then((after) => {
            if (!after || before.location !== 'congelador') return;
            setUndo({
              id: before.id,
              before,
              text: `${before.name}: fora do congelador, ${after.expires_at ? `usar até ${formatShortDate(after.expires_at).replace(/\.$/, '')}` : 'usar em breve'}.`,
            });
          });
        },
        onDate: (date, kind) => void setExpiry(entry.item.id, date, kind),
        onCategory: (category) =>
          void setCategory(entry.item.id, category).then((before) => {
            if (!before) return;
            setUndo({
              id: before.id,
              before,
              text: `${before.name}: ${categoryById(category)?.label ?? category}.`,
            });
          }),
        onFreeze: () =>
          void freeze(entry.item.id).then((before) => {
            if (!before) return;
            setUndo({
              id: before.id,
              before,
              text: `${before.name}: no congelador, dura cerca de ${Math.round(frozenDays() / 30)} meses.`,
            });
          }),
        onOffer: () => void share(offerText(entry.item, entry.daysLeft ?? 0)),
        onUseOne: () => {
          const before = entry.item;
          void takeOne(before.id).then((left) => {
            if (left === null) return;
            setUndo({
              id: before.id,
              before,
              text:
                left === 1
                  ? `${before.name}: fica 1. Está a acabar?`
                  : `${before.name}: ficam ${left}.`,
              action:
                left === 1 && !listed?.has(sameName(before.name))
                  ? { label: 'Juntar à lista', run: () => void addToList(before.name) }
                  : undefined,
            });
          });
        },
        onMove: (to) => {
          void moveTo(entry.item.id, to).then((moved) => {
            if (!moved) return;
            const { before, after } = moved;
            const when =
              after.expires_at && after.expires_at !== before.expires_at
                ? `, agora até ${formatShortDate(after.expires_at).replace(/\.$/, '')}`
                : '';
            const warning =
              to === 'congelador' && freezesBadly(before) ? ' Isto não costuma congelar bem.' : '';
            setUndo({
              id: before.id,
              before,
              text: `${before.name}: ${IN_LOCATION[to]}${when}.${warning}`,
            });
          });
        },
        onEatPart: (left) => {
          void eatPart(entry.item.id, left).then((before) => {
            if (!before) return;
            const word = usedWord(before).toLowerCase();
            const rest =
              left > 0
                ? `sobra ~${left.toLocaleString('pt-PT')}${before.unit ? ` ${before.unit}` : ''}`
                : `${word}, não sobrou nada`;
            setUndo({
              id: before.id,
              before,
              text: `${before.name}: ${rest}.${left > 0 && canFreeze(before, entry.daysLeft) ? ' Congela o resto se não for para já.' : ''}`,
            });
          });
        },
        onRunningLow: () => {
          const item = entry.item;
          void runningLow(item).then(() =>
            setUndo({
              id: item.id,
              text: `${item.name}: na lista de compras. Continua em casa até acabar.`,
              revert: () => takeOffList(item.name),
            }),
          );
        },
        onFinished: () => {
          const item = entry.item;
          void finished(item.id).then(() =>
            setUndo({
              id: item.id,
              text: `${item.name}: acabou. Está na lista de compras.`,
              revert: async () => {
                await reactivateItem(item.id);
                await takeOffList(item.name);
              },
            }),
          );
        },
      }}
    />
  );

  const dueSoon = lit.some(
    (entry) => !entry.longLife && (entry.light === 'red' || entry.light === 'amber'),
  );

  return (
    <div className="home">
      {dueSoon && (
        <Link className="button primary dinner-call" to="/receitas">
          O que cozinhar hoje?
        </Link>
      )}

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
            <span className="chip-count">
              {' '}
              {place === 'tudo'
                ? lit.length
                : lit.filter((entry) => entry.item.location === place).length}
            </span>
          </button>
        ))}
      </div>

      <div className="view-switch" role="group" aria-label="Ver como">
        {(['lista', 'cozinha'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            onClick={() => setFoodView(option)}
          >
            {option === 'lista' ? 'Lista' : 'Cozinha'}
          </button>
        ))}
      </div>

      {view === 'cozinha' && (
        <KitchenSide
          entries={inPlace}
          layout={layout}
          place={filter}
          picked={picked}
          onPick={(id) => setPicked((current) => (current === id ? undefined : id))}
          card={card}
        />
      )}

      {view === 'lista' && undated.length > 0 && (
        <section className="group group-undated">
          <h2>
            Sem data, confirma <span className="count">{undated.length}</span>
          </h2>
          <p className="hint">
            Não se sabe quanto tempo duram. Escolhe o tipo ou escreve a data (✎) para entrarem no
            semáforo.
          </p>
          <ul className="items">{undated.map(card)}</ul>
        </section>
      )}

      {view === 'lista' &&
        GROUPS.map((group) => {
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

      {view === 'lista' &&
        undated.length === 0 &&
        inPlace.length === longLife.length &&
        !showLongLife && (
          <p className="nothing">
            {filter === 'tudo'
              ? 'Nada a expirar por agora.'
              : `Nada a expirar ${IN_LOCATION[filter]}.`}
          </p>
        )}

      {view === 'lista' && longLife.length > 0 && (
        <section className="group group-long">
          <button
            type="button"
            className="ghost"
            aria-expanded={showLongLife}
            onClick={() => setShowLongLife((open) => !open)}
          >
            {showLongLife ? 'Esconder' : 'Mostrar'} o stock da despensa ({longLife.length})
          </button>
          {showLongLife && <ul className="items">{longLife.map(card)}</ul>}
        </section>
      )}

      <GuestNote />

      <Link to="/adicionar" className="fab">
        Adicionar
      </Link>

      {snackbar}
    </div>
  );
}

/** The drawn kitchen, and under it the card of the item tapped (the same one-tap answers). */
function KitchenSide({
  entries,
  layout,
  place,
  picked,
  onPick,
  card,
}: {
  entries: LitItem[];
  layout: ReturnType<typeof useKitchenLayout>;
  place: Filter;
  picked?: string;
  onPick: (id: string) => void;
  card: (entry: LitItem) => React.ReactNode;
}) {
  const chosen = entries.find((entry) => entry.item.id === picked);
  const cardRef = useRef<HTMLUListElement>(null);
  // The card is under the item's appliance: bring it into sight when an item is tapped.
  useEffect(() => {
    if (!picked) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cardRef.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [picked]);
  return (
    <>
      <KitchenView
        entries={entries}
        layout={layout}
        place={place}
        selected={chosen?.item.id}
        onSelect={onPick}
        card={
          chosen && (
            <ul className="items kitchen-card" aria-live="polite" ref={cardRef}>
              {card(chosen)}
            </ul>
          )
        }
      />
      {!chosen && (
        <p className="hint kitchen-hint">
          Toca num alimento para o marcar como comido, deitado fora ou aberto. O que acaba primeiro
          está na prateleira de cima. <Link to="/definicoes#cozinha">Mudar o frigorífico</Link>.
        </p>
      )}
    </>
  );
}

/** Without an account, where the data lives (and so what clearing the browser would lose). */
function GuestNote() {
  const account = useAccount();
  if (account.status !== 'ready' || account.me) return null;
  return (
    <p className="guest-note">
      Sem conta: os dados ficam só neste browser. <Link to="/criar-conta">Criar conta</Link>{' '}
      guarda-os e partilha-os com a família.
    </p>
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
        <p className="empty-alt">
          A casa já está cheia?{' '}
          <Link to="/adicionar#inventario">Fotografa o frigorífico e a despensa</Link> e a app faz a
          lista.
        </p>
      </section>
      <GuestNote />
      <InstallSection />
    </div>
  );
}
