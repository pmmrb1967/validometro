// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Add one item by hand or by barcode. Everything is suggested and everything can be changed:
 * the category from the name (or Open Food Facts), the place from the category, the expiry from
 * the rules. A date typed by the user always wins; quantity is optional.
 */
import { useCallback, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { categoryById, CATEGORIES, suggestCategory } from '../../domain/categories';
import { defaultKind, EXPIRY_KIND_LABELS, kindFromReading } from '../../domain/date-kind';
import { daysBetween, isIsoDate, lisbonDate } from '../../domain/dates';
import { plausiblePrice } from '../../domain/drafts';
import { findRule, isLongLife, suggestExpiry } from '../../domain/shelf-life';
import {
  EXPIRY_KINDS,
  IN_LOCATION,
  LOCATION_LABELS,
  LOCATIONS,
  type ExpiryKind,
  type Location,
} from '../../domain/types';
import { UNITS } from '../../domain/units';
import { ApiError, fetchProduct, readPrintedDate } from '../api';
import { PhotoButton } from '../components/PhotoButton';
import { StatusNote } from '../components/BusyNote';
import { hasCamera } from '../image';
import { QuickEntry } from '../components/QuickEntry';
import { ShelfEntry } from '../components/ShelfEntry';
import { Scanner } from '../components/Scanner';
import { addItem } from '../store/items';
import { AiCostNote } from '../components/AiCostNote';

export function AddItem() {
  const navigate = useNavigate();
  const ids = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const today = lisbonDate(new Date());

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [location, setLocation] = useState<Location>('frigorifico');
  const [locationTouched, setLocationTouched] = useState(false);
  const [opened, setOpened] = useState(false);
  const [expires, setExpires] = useState('');
  const [expiresTouched, setExpiresTouched] = useState(false);
  /** The date was read from the package (principle 5: printed beats estimated). */
  const [printed, setPrinted] = useState(false);
  const [dateNote, setDateNote] = useState<string>();
  /** "Consumir até" or "de preferência"; '' = the category's usual. */
  const [kind, setKind] = useState<ExpiryKind | ''>('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [ean, setEan] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [productNote, setProductNote] = useState<string>();
  const [saved, setSaved] = useState<string>();

  const state = opened ? 'aberto' : 'fechado';
  const suggested = suggestExpiry(category || null, location, state, today);
  const shownExpiry = expiresTouched ? expires : (suggested ?? '');

  /** A new category, from the user or a guess: moves the place too unless the user chose it. */
  const applyCategory = (next: string) => {
    setCategory(next);
    const home = categoryById(next)?.defaultLocation;
    if (home && !locationTouched) setLocation(home);
  };

  const onName = (value: string) => {
    setName(value);
    if (!categoryTouched) applyCategory(suggestCategory(value) ?? '');
  };

  const onCode = useCallback(
    (code: string) => {
      setScanning(false);
      setEan(code);
      setProductNote('A procurar o produto…');
      fetchProduct(code)
        .then((product) => {
          if (!product.found || !product.name) {
            setProductNote('Não encontrámos este código. Escreve o nome do produto.');
            nameInput.current?.focus();
            return;
          }
          setName(product.name);
          if (!categoryTouched)
            applyCategory(product.category ?? suggestCategory(product.name) ?? '');
          setProductNote(product.brand ? `Marca: ${product.brand}.` : undefined);
        })
        .catch((err: unknown) => {
          setProductNote(err instanceof ApiError ? err.message : 'Escreve o nome à mão.');
          nameInput.current?.focus();
        });
    },
    // applyCategory only reads state that is in this list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoryTouched, locationTouched],
  );

  const reset = () => {
    setName('');
    setCategory('');
    setCategoryTouched(false);
    setLocationTouched(false);
    setLocation('frigorifico');
    setOpened(false);
    setExpires('');
    setExpiresTouched(false);
    setPrinted(false);
    setDateNote(undefined);
    setKind('');
    setPrice('');
    setQuantity('');
    setUnit('');
    setEan(null);
    setProductNote(undefined);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const another = (event.nativeEvent as SubmitEvent).submitter?.dataset.another === 'true';
    const trimmed = name.trim();
    if (!trimmed) return;
    const date = isIsoDate(shownExpiry) ? shownExpiry : null;
    const amount = Number(quantity.replace(',', '.'));
    await addItem({
      name: trimmed,
      category: category || null,
      location,
      expires_at: date,
      expiry_source: printed ? 'impressa' : expiresTouched ? 'manual' : 'estimada',
      expiry_kind: expiresTouched && kind ? kind : null,
      price: plausiblePrice(Number(price.replace(',', '.'))),
      quantity: quantity.trim() && Number.isFinite(amount) && amount > 0 ? amount : null,
      unit: quantity.trim() ? unit : null,
      ean,
      opened,
    });
    if (another) {
      reset();
      setSaved(`${trimmed} guardado.`);
      nameInput.current?.focus();
    } else {
      navigate('/');
    }
  };

  const rule = findRule(category || null, location, state);
  const label = categoryById(category)?.label;
  let expiryHint: string;
  let fromRules = false;
  if (printed) {
    expiryHint = 'Data lida da embalagem. Confirma se está certa.';
  } else if (expiresTouched) {
    expiryHint = 'Data escrita por ti.';
  } else if (isLongLife(category || null)) {
    expiryHint = 'Longa duração: fica fora do semáforo. Podes escrever a data, se quiseres.';
  } else if (suggested && rule && label) {
    const days = daysBetween(today, suggested);
    fromRules = true;
    expiryHint = `Estimativa: ${label.toLowerCase()} ${opened ? 'aberto ' : ''}${IN_LOCATION[location]} dura ${days} ${days === 1 ? 'dia' : 'dias'}. Se a embalagem tiver data, escreve-a.`;
  } else {
    expiryHint = 'Sem estimativa para isto: escreve a data da embalagem, se houver.';
  }

  return (
    <div className="add">
      <h1 className="page-title">Adicionar alimentos</h1>

      <QuickEntry />

      <h2 className="section-title">Um de cada vez</h2>

      <button type="button" className="secondary scan-button" onClick={() => setScanning(true)}>
        Ler código de barras
      </button>
      <StatusNote text={productNote} />

      <form className="form" onSubmit={(event) => void save(event)}>
        <label className="field">
          <span>Nome</span>
          <input
            ref={nameInput}
            value={name}
            onChange={(event) => onName(event.target.value)}
            placeholder="Iogurtes, bifes de frango, alface…"
            autoComplete="off"
            enterKeyHint="next"
            required
          />
        </label>

        <fieldset className="field">
          <legend>Onde fica</legend>
          <div className="segmented">
            {LOCATIONS.map((place) => (
              <label key={place}>
                <input
                  type="radio"
                  name={`${ids}-location`}
                  checked={location === place}
                  onChange={() => {
                    setLocation(place);
                    setLocationTouched(true);
                  }}
                />
                <span>{LOCATION_LABELS[place]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span>Tipo</span>
          <select
            value={category}
            onChange={(event) => {
              setCategoryTouched(true);
              applyCategory(event.target.value);
            }}
          >
            <option value="">Outro</option>
            {CATEGORIES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={opened}
            onChange={(event) => setOpened(event.target.checked)}
          />
          <span>Já está aberto</span>
        </label>

        <div className="field">
          <label htmlFor={`${ids}-expires`}>Validade</label>
          <div className="row">
            <input
              id={`${ids}-expires`}
              type="date"
              value={shownExpiry}
              min={today}
              onChange={(event) => {
                setExpires(event.target.value);
                setExpiresTouched(true);
                setPrinted(false);
              }}
            />
            <PhotoButton
              className="ghost"
              onError={setDateNote}
              onPhoto={(image) => {
                setDateNote('A ler a data…');
                readPrintedDate(image)
                  .then(({ date, kind: read }) => {
                    setExpires(date);
                    setExpiresTouched(true);
                    setPrinted(true);
                    setKind(kindFromReading(read) ?? '');
                    setDateNote(undefined);
                  })
                  .catch((err: unknown) =>
                    setDateNote(err instanceof ApiError ? err.message : 'Não consegui ler a data.'),
                  );
              }}
            >
              {hasCamera() ? 'Fotografar a validade' : 'Foto da validade'}
            </PhotoButton>
            {expiresTouched && suggested && (
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setExpiresTouched(false);
                  setPrinted(false);
                  setExpires('');
                }}
              >
                Usar estimativa
              </button>
            )}
          </div>
          <p className="hint">
            {expiryHint}
            {fromRules && (
              <>
                {' '}
                <Link to="/definicoes/validades">Mudar a regra</Link>.
              </>
            )}
          </p>
          {!printed && (
            <p className="hint">
              {hasCamera()
                ? 'Fotografa a data impressa na embalagem'
                : 'Escolhe uma foto da data impressa na embalagem'}
              : a app lê-a, e também se é “consumir até” ou “de preferência”.
            </p>
          )}
          {!printed && <AiCostNote operation="date" />}
          <StatusNote text={dateNote} />
        </div>

        {expiresTouched && (
          <fieldset className="field">
            <legend>Na embalagem diz</legend>
            <div className="segmented segmented-two">
              {EXPIRY_KINDS.map((option) => (
                <label key={option}>
                  <input
                    type="radio"
                    name={`${ids}-kind`}
                    checked={(kind || defaultKind(category || null)) === option}
                    onChange={() => setKind(option)}
                  />
                  <span>{option === 'consumir_ate' ? 'Consumir até' : 'De preferência'}</span>
                </label>
              ))}
            </div>
            <p className="hint">
              {(kind || defaultKind(category || null)) === 'consumir_de_preferencia'
                ? 'Data de qualidade: depois dela, olha, cheira e prova antes de deitar fora.'
                : (kind || defaultKind(category || null)) === 'consumir_ate'
                  ? `${EXPIRY_KIND_LABELS.consumir_ate}: data de segurança, depois dela não se come.`
                  : 'Escolhe o que diz a embalagem: muda o aviso depois da data.'}
            </p>
          </fieldset>
        )}

        <fieldset className="field">
          <legend>
            Quantidade <span className="optional">(opcional)</span>
          </legend>
          <div className="row">
            <input
              className="quantity"
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              aria-label="Quantidade"
              placeholder="2"
            />
            <input
              className="unit"
              list={`${ids}-units`}
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              aria-label="Unidade"
              placeholder="un."
            />
            <datalist id={`${ids}-units`}>
              {UNITS.map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
          </div>
        </fieldset>

        <label className="field">
          <span>
            Preço <span className="optional">(opcional, para contar o desperdício em euros)</span>
          </span>
          <input
            className="quantity"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="1,29 €"
          />
        </label>

        <div className="form-actions">
          <button type="submit" className="primary">
            Guardar
          </button>
          <button type="submit" className="secondary" data-another="true">
            Guardar e adicionar outro
          </button>
        </div>
        {saved && (
          <p className="note" role="status">
            {saved}
          </p>
        )}
      </form>

      {scanning && <Scanner onCode={onCode} onClose={() => setScanning(false)} />}
      <ShelfEntry />
    </div>
  );
}
