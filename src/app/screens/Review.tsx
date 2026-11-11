// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Review before saving: what the AI read from the receipt (or from what was said), every
 * field editable. Long-life lines start unticked (principle 1). Confirming saves the items and
 * teaches the shared dictionary what each receipt line meant.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CATEGORIES, categoryById } from '../../domain/categories';
import { formatShortDate, isIsoDate, lisbonDate } from '../../domain/dates';
import { kindFromReading } from '../../domain/date-kind';
import { plausiblePrice, purchaseDay, type DraftItem } from '../../domain/drafts';
import { formatEuros } from '../../domain/stats';
import { suggestExpiry } from '../../domain/shelf-life';
import { parseQuantity, quantityInputText, UNITS } from '../../domain/units';
import {
  LOCATION_LABELS,
  LOCATIONS,
  type ExpiryKind,
  type ExpirySource,
  type Location,
} from '../../domain/types';
import { ApiError, readPrintedDate, teachAliases } from '../api';
import { PhotoButton } from '../components/PhotoButton';
import { StatusNote } from '../components/BusyNote';
import { hasCamera } from '../image';
import { addItem } from '../store/items';
import { clearPendingReview, getPendingReview } from '../store/review';
import { AiCostNote } from '../components/AiCostNote';

interface Row extends DraftItem {
  include: boolean;
  /** From the date photo: "consumir até" or "de preferência". */
  expiry_kind?: ExpiryKind | null;
  /** The price as typed, while editing ("1,2"). */
  priceText: string;
  /** The quantity as typed ("1,632"); empty = no quantity (principle 2: optional). */
  quantityText: string;
}

const priceText = (price: number | null) =>
  price === null ? '' : price.toFixed(2).replace('.', ',');

const SOURCE_LABEL: Record<ExpirySource, string> = {
  estimada: 'estimada',
  impressa: 'lida da embalagem',
  manual: 'escrita por ti',
};

export function Review() {
  const navigate = useNavigate();
  const [pending] = useState(getPendingReview);
  const [rows, setRows] = useState<Row[]>(
    () =>
      pending?.drafts.map((draft) => ({
        ...draft,
        // The server estimates with the default rules; this household may have its own.
        ...(draft.expiry_source === 'estimada' && draft.category
          ? {
              expires_at:
                suggestExpiry(
                  draft.category,
                  draft.location,
                  'fechado',
                  purchaseDay(pending.date, lisbonDate(new Date())),
                ) ?? draft.expires_at,
            }
          : {}),
        include: draft.perishable || draft.tracked === true,
        priceText: priceText(draft.price ?? null),
        quantityText: quantityInputText(draft.quantity),
      })) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string>();
  const today = lisbonDate(new Date());

  if (!pending) {
    return (
      <div className="review">
        <h1 className="page-title">Rever compras</h1>
        <p className="hint">Não há nada para rever.</p>
        <Link className="button primary" to="/adicionar">
          Adicionar alimentos
        </Link>
      </div>
    );
  }

  const update = (key: string, change: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));

  /** A new type or place re-estimates the date, unless it was read or typed. */
  const reestimate = (row: Row, category: string | null, location: Location): Partial<Row> => {
    if (row.expiry_source === 'impressa' || row.expiry_source === 'manual')
      return { category, location };
    const expires = suggestExpiry(category, location, 'fechado', today);
    return { category, location, expires_at: expires, expiry_source: expires ? 'estimada' : null };
  };

  const chosen = rows.filter((row) => row.include && row.name.trim());
  const total = chosen.reduce(
    (sum, row) => sum + (plausiblePrice(Number(row.priceText.replace(',', '.'))) ?? 0),
    0,
  );

  const save = async () => {
    setSaving(true);
    for (const row of chosen) {
      await addItem({
        name: row.name,
        category: row.category,
        location: row.location,
        expires_at: row.expires_at,
        expiry_source: row.expires_at ? row.expiry_source : null,
        quantity: parseQuantity(row.quantityText),
        unit: parseQuantity(row.quantityText) === null ? null : row.unit?.trim() || null,
        expiry_kind: row.expiry_kind ?? null,
        price: plausiblePrice(Number(row.priceText.replace(',', '.'))),
      });
    }
    await teachAliases(
      pending.store,
      chosen.flatMap((row) =>
        row.raw
          ? [
              {
                raw: row.raw,
                name: row.name.trim(),
                category: row.category,
                perishable: row.perishable,
              },
            ]
          : [],
      ),
    );
    clearPendingReview();
    navigate('/', { replace: true });
  };

  const discard = () => {
    clearPendingReview();
    navigate('/adicionar', { replace: true });
  };

  const from = [
    pending.store,
    pending.date && isIsoDate(pending.date) ? formatShortDate(pending.date) : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="review">
      <h1 className="page-title">Rever compras</h1>
      <p className="hint">
        {pending.source === 'receipt'
          ? `Talão${from ? ` ${from}` : ''}${from.endsWith('.') ? '' : '.'} `
          : pending.source === 'shelf'
            ? 'Do que se vê nas fotos. As datas são estimadas a partir de hoje. '
            : 'Do que disseste. '}
        Confirma os nomes e as datas. Se a embalagem tiver data, escreve-a ou fotografa-a.
      </p>
      <AiCostNote operation="date" />

      <ul className="review-list">
        {rows.map((row) => (
          <li key={row.key} className={row.include ? 'review-row' : 'review-row off'}>
            <label className="check review-include">
              <input
                type="checkbox"
                checked={row.include}
                onChange={(event) => update(row.key, { include: event.target.checked })}
              />
              <span className="visually-hidden">Guardar {row.name}</span>
            </label>
            <div className="review-fields">
              <input
                className="review-name"
                value={row.name}
                aria-label="Nome"
                onChange={(event) => update(row.key, { name: event.target.value })}
              />
              {row.raw && (
                <p className="review-raw">
                  No talão: {row.raw}
                  {row.known && ' (já conhecido)'}
                </p>
              )}
              {!row.perishable &&
                (row.tracked ? (
                  <p className="review-raw">
                    Já acompanhas o stock disto: em casa, “Está a acabar” junta-o à lista.
                  </p>
                ) : (
                  !row.include && (
                    <p className="review-raw">
                      Longa duração: fica de fora. Marca-o para acompanhares o stock; nas próximas
                      compras já vem marcado.
                    </p>
                  )
                ))}
              <div className="review-grid">
                <select
                  aria-label="Tipo"
                  value={row.category ?? ''}
                  onChange={(event) => {
                    const category = event.target.value || null;
                    const home = categoryById(category)?.defaultLocation ?? row.location;
                    update(row.key, reestimate(row, category, home));
                  }}
                >
                  <option value="">Outro</option>
                  {CATEGORIES.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Onde fica"
                  value={row.location}
                  onChange={(event) =>
                    update(row.key, reestimate(row, row.category, event.target.value as Location))
                  }
                >
                  {LOCATIONS.map((place) => (
                    <option key={place} value={place}>
                      {LOCATION_LABELS[place]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="row review-date">
                <input
                  type="date"
                  aria-label="Validade"
                  value={row.expires_at ?? ''}
                  onChange={(event) =>
                    update(row.key, {
                      expires_at: event.target.value || null,
                      expiry_source: event.target.value ? 'manual' : null,
                    })
                  }
                />
                <PhotoButton
                  className="ghost"
                  onError={setNote}
                  onPhoto={(image) => {
                    setNote(`A ler a data de ${row.name}…`);
                    readPrintedDate(image)
                      .then(({ date, kind }) => {
                        update(row.key, {
                          expires_at: date,
                          expiry_source: 'impressa',
                          expiry_kind: kindFromReading(kind),
                        });
                        setNote(undefined);
                      })
                      .catch((err: unknown) =>
                        setNote(err instanceof ApiError ? err.message : 'Não consegui ler a data.'),
                      );
                  }}
                >
                  {hasCamera() ? 'Fotografar a validade' : 'Foto da validade'}
                </PhotoButton>
                <input
                  className="review-price"
                  inputMode="decimal"
                  aria-label={`Preço de ${row.name}, em euros`}
                  placeholder="€"
                  value={row.priceText}
                  onChange={(event) => update(row.key, { priceText: event.target.value })}
                />
              </div>
              <div className="row review-quantity">
                <span className="review-raw">Quantidade</span>
                <input
                  className="review-amount"
                  inputMode="decimal"
                  aria-label={`Quantidade de ${row.name}`}
                  placeholder="—"
                  value={row.quantityText}
                  onChange={(event) => update(row.key, { quantityText: event.target.value })}
                />
                <input
                  className="review-unit"
                  list="review-units"
                  aria-label={`Unidade de ${row.name}`}
                  placeholder="un."
                  value={row.unit ?? ''}
                  onChange={(event) => update(row.key, { unit: event.target.value || null })}
                />
              </div>
              <p className="review-raw">
                {row.expires_at && row.expiry_source
                  ? `Validade ${SOURCE_LABEL[row.expiry_source]}${row.expiry_kind === 'consumir_de_preferencia' ? ' (de preferência)' : row.expiry_kind === 'consumir_ate' ? ' (consumir até)' : ''}.`
                  : 'Sem validade: fica fora do semáforo.'}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <datalist id="review-units">
        {UNITS.map((entry) => (
          <option key={entry} value={entry} />
        ))}
      </datalist>

      <StatusNote text={note} />

      {total > 0 && (
        <p className="hint">
          Preços dos alimentos escolhidos: {formatEuros(total)}. Servem para contar o desperdício em
          euros; podes corrigi-los ou apagá-los.
        </p>
      )}

      <div className="review-actions">
        <button
          type="button"
          className="primary"
          disabled={saving || !chosen.length}
          onClick={() => void save()}
        >
          {chosen.length === 1 ? 'Guardar 1 alimento' : `Guardar ${chosen.length} alimentos`}
        </button>
        <button type="button" className="ghost" disabled={saving} onClick={discard}>
          Descartar
        </button>
      </div>
    </div>
  );
}
