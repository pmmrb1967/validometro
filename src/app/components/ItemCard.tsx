// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { formatShortDate, isIsoDate } from '../../domain/dates';
import { findRule } from '../../domain/shelf-life';
import { daysLabel, type LitItem } from '../../domain/traffic-light';
import { LOCATION_LABELS } from '../../domain/types';

export interface ItemActions {
  onEaten: () => void;
  onThrownAway: () => void;
  onOpened: () => void;
  onDate: (date: string) => void;
}

function quantityText(quantity: number | null, unit: string | null): string | undefined {
  if (quantity === null) return undefined;
  return unit
    ? `${quantity.toLocaleString('pt-PT')} ${unit}`
    : `${quantity.toLocaleString('pt-PT')}×`;
}

/** One item: what, where, how long; and the one-tap answers. */
export function ItemCard({ lit, actions }: { lit: LitItem; actions: ItemActions }) {
  const { item, daysLeft, light } = lit;
  const [editingDate, setEditingDate] = useState(false);
  // Only when opening changes something: an opened rule exists (eggs have none).
  const canOpen =
    !item.opened_at && findRule(item.category, item.location, 'aberto')?.state === 'aberto';

  const details = [
    LOCATION_LABELS[item.location],
    item.opened_at ? 'aberto' : undefined,
    quantityText(item.quantity, item.unit),
  ].filter(Boolean);

  return (
    <li className={`item light-${light ?? 'none'}`}>
      <div className="item-main">
        <div className="item-text">
          <span className="item-name">{item.name}</span>
          <span className="item-meta">{details.join(', ')}</span>
        </div>
        {/* The date is the "Editar data" control: one tap, where the eye already is. */}
        <button
          type="button"
          className="item-days"
          aria-label={`${daysLabel(daysLeft)}. Editar data`}
          aria-expanded={editingDate}
          onClick={() => setEditingDate((open) => !open)}
        >
          <span className="days">{daysLabel(daysLeft)}</span>
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

      {editingDate ? (
        <form
          className="item-date-form"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get('date');
            if (typeof value === 'string' && isIsoDate(value)) actions.onDate(value);
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
          <button type="submit" className="secondary">
            Guardar data
          </button>
          <button type="button" className="ghost" onClick={() => setEditingDate(false)}>
            Cancelar
          </button>
        </form>
      ) : (
        <div className="item-actions">
          <button type="button" className="action eaten" onClick={actions.onEaten}>
            Comido
          </button>
          <button type="button" className="action thrown" onClick={actions.onThrownAway}>
            Deitado fora
          </button>
          {canOpen && (
            <button type="button" className="action" onClick={actions.onOpened}>
              Abri isto
            </button>
          )}
        </div>
      )}
    </li>
  );
}
