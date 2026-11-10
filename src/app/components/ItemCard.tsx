// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import {
  canEatPart,
  canTakeOne,
  isDrink,
  eatPartLabel,
  leftAfterEating,
  leftAfterShare,
  takeOneLabel,
  usedWord,
} from '../../domain/consume';
import {
  afterDateAdvice,
  bestBeforeLabel,
  EXPIRY_KIND_LABELS,
  pastBestBefore,
} from '../../domain/date-kind';
import { formatShortDate, isIsoDate } from '../../domain/dates';
import { canFreeze, canThaw } from '../../domain/freeze';
import { canOffer } from '../../domain/offer';
import { findRule } from '../../domain/shelf-life';
import { daysLabel, type LitItem } from '../../domain/traffic-light';
import { EXPIRY_KINDS, LOCATION_LABELS, type ExpiryKind } from '../../domain/types';

export interface ItemActions {
  onEaten: () => void;
  onThrownAway: () => void;
  onOpened: () => void;
  onDate: (date: string, kind: ExpiryKind | null) => void;
  onFreeze: () => void;
  onOffer: () => void;
  /** "Comi 1" / "Bebi 1": one less of several. */
  onUseOne: () => void;
  /** "Comi uma parte": what is left, in the item's unit (0: all of it). */
  onEatPart: (left: number) => void;
  /** Long life: "Está a acabar" (onto the list) and "Acabou" (out, and onto the list). */
  onRunningLow: () => void;
  onFinished: () => void;
}

function quantityText(quantity: number | null, unit: string | null): string | undefined {
  if (quantity === null) return undefined;
  return unit
    ? `${quantity.toLocaleString('pt-PT')} ${unit}`
    : `${quantity.toLocaleString('pt-PT')}×`;
}

/** One item: what, where, how long; and the one-tap answers. */
export function ItemCard({
  lit,
  actions,
  onList = false,
}: {
  lit: LitItem;
  actions: ItemActions;
  /** Already on the shopping list (to buy): "Está a acabar" is done. */
  onList?: boolean;
}) {
  const { item, daysLeft, light, longLife } = lit;
  const one = canTakeOne(item);
  const part = canEatPart(item);
  const [eatingPart, setEatingPart] = useState(false);
  const [eaten, setEaten] = useState('');
  const [partError, setPartError] = useState<string>();
  const closePart = () => {
    setEatingPart(false);
    setEaten('');
    setPartError(undefined);
  };
  const leaving = (left: number) => {
    actions.onEatPart(left);
    closePart();
  };
  const [editingDate, setEditingDate] = useState(false);
  const thaw = canThaw(item);
  // Only when opening changes something: an opened rule exists (eggs have none).
  const canOpen =
    !item.opened_at && findRule(item.category, item.location, 'aberto')?.state === 'aberto';
  const freezable = canFreeze(item, daysLeft);
  const offer = canOffer(item, daysLeft);
  const bestBefore = pastBestBefore(item, daysLeft);
  const advice = afterDateAdvice(item, daysLeft);

  const details = [
    LOCATION_LABELS[item.location],
    item.opened_at ? 'aberto' : undefined,
    quantityText(item.quantity, item.unit),
  ].filter(Boolean);

  const daysText =
    bestBefore && daysLeft !== null ? bestBeforeLabel(daysLeft) : daysLabel(daysLeft);

  return (
    <li className={`item light-${light ?? 'none'}${bestBefore ? ' best-before' : ''}`}>
      <div className="item-main">
        <div className="item-text">
          <span className="item-name">{item.name}</span>
          <span className="item-meta">{details.join(', ')}</span>
        </div>
        {/* The date is the "Editar data" control: one tap, where the eye already is. */}
        <button
          type="button"
          className="item-days"
          aria-label={`${daysText}. Editar data`}
          aria-expanded={editingDate}
          onClick={() => setEditingDate((open) => !open)}
        >
          <span className="days">{daysText}</span>
          <span className="date">
            {item.expires_at ? formatShortDate(item.expires_at) : 'Pôr data'}
            {item.expiry_source === 'estimada' ? ' (estimada)' : ''}
            <span className="edit-mark" aria-hidden="true">
              {' '}
              ✎
            </span>
          </span>
        </button>
      </div>

      {advice && !editingDate && <p className="item-advice">{advice}</p>}

      {eatingPart ? (
        <form
          className="item-part-form"
          onSubmit={(event) => {
            event.preventDefault();
            const left = leftAfterEating(item, eaten);
            if (left === null) {
              setPartError(`Escreve quanto, por exemplo “400 g” ou “0,4 ${item.unit ?? 'kg'}”.`);
              return;
            }
            leaving(left);
          }}
        >
          <div className="part-shares">
            <button
              type="button"
              className="secondary"
              onClick={() => leaving(leftAfterShare(item, 'metade'))}
            >
              Metade
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => leaving(leftAfterShare(item, 'pouco'))}
            >
              Um pouco
            </button>
          </div>
          <label>
            {isDrink(item) ? 'Ou quanto bebeste' : 'Ou quanto comeste'}
            <input
              inputMode="decimal"
              autoComplete="off"
              placeholder={`ex.: 400 g (há ${quantityText(item.quantity, item.unit)})`}
              value={eaten}
              autoFocus
              onChange={(event) => {
                setEaten(event.target.value);
                setPartError(undefined);
              }}
            />
          </label>
          {partError && (
            <p className="note error" role="alert">
              {partError}
            </p>
          )}
          <button type="submit" className="secondary">
            Guardar
          </button>
          <button type="button" className="ghost" onClick={closePart}>
            Cancelar
          </button>
        </form>
      ) : editingDate ? (
        <form
          className="item-date-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const value = form.get('date');
            const kind = form.get('kind');
            if (typeof value === 'string' && isIsoDate(value)) {
              actions.onDate(
                value,
                EXPIRY_KINDS.includes(kind as ExpiryKind) ? (kind as ExpiryKind) : null,
              );
            }
            setEditingDate(false);
          }}
        >
          <label>
            Nova data
            <input
              type="date"
              name="date"
              defaultValue={item.expires_at ?? ''}
              required
              autoFocus
            />
          </label>
          <label>
            Na embalagem diz
            <select name="kind" defaultValue={item.expiry_kind ?? ''}>
              <option value="">Não sei</option>
              {EXPIRY_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {EXPIRY_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="secondary">
            Guardar data
          </button>
          <button type="button" className="ghost" onClick={() => setEditingDate(false)}>
            Cancelar
          </button>
        </form>
      ) : (
        <>
          {longLife ? (
            // A pantry staple: no date to watch, but the shopping list to keep.
            <div className="item-actions">
              <button
                type="button"
                className="action"
                disabled={onList}
                onClick={actions.onRunningLow}
              >
                {onList ? 'Na lista ✓' : 'Está a acabar'}
              </button>
              <button type="button" className="action eaten" onClick={actions.onFinished}>
                Acabou
              </button>
              <button type="button" className="action thrown" onClick={actions.onThrownAway}>
                Deitado fora
              </button>
            </div>
          ) : (
            <div className="item-actions">
              <button type="button" className="action eaten" onClick={actions.onEaten}>
                {usedWord(item)}
              </button>
              <button type="button" className="action thrown" onClick={actions.onThrownAway}>
                Deitado fora
              </button>
              {canOpen && (
                <button type="button" className="action" onClick={actions.onOpened}>
                  {thaw ? 'Tirei do congelador' : 'Abri isto'}
                </button>
              )}
            </div>
          )}
          {(freezable || offer || one || part) && (
            <div className="item-extra">
              {part && (
                <button type="button" className="extra-action" onClick={() => setEatingPart(true)}>
                  {eatPartLabel(item)}
                </button>
              )}
              {one && (
                <button type="button" className="extra-action" onClick={actions.onUseOne}>
                  {takeOneLabel(item)}
                </button>
              )}
              {freezable && (
                <button type="button" className="extra-action" onClick={actions.onFreeze}>
                  <span aria-hidden="true">❄ </span>Congelei
                </button>
              )}
              {offer && (
                <button type="button" className="extra-action" onClick={actions.onOffer}>
                  Oferecer
                </button>
              )}
              {freezable && <span className="extra-hint">Ainda vais a tempo de congelar.</span>}
            </div>
          )}
        </>
      )}
    </li>
  );
}
