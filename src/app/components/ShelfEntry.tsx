// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The first inventory: starting with the house already full, photos of the fridge, freezer or
 * pantry (up to four: shelves, drawers, the door) instead of typing it all. The AI lists what
 * it sees; the review screen asks to confirm, since a photo rarely shows the dates. Photos are
 * read and dropped, never kept (principle 7).
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { LOCATION_LABELS, LOCATIONS, type Location } from '../../domain/types';
import { ApiError, MAX_RECEIPT_PARTS, readShelf } from '../api';
import { hasCamera } from '../image';
import { markTracked, setPendingReview } from '../store/review';
import { BusyNote } from './BusyNote';
import { PhotoButton } from './PhotoButton';

/** The first button: "Fotografar o frigorífico" on a phone, "Foto do frigorífico" elsewhere. */
const FIRST: Record<Location, [camera: string, file: string]> = {
  frigorifico: ['Fotografar o frigorífico', 'Foto do frigorífico'],
  congelador: ['Fotografar o congelador', 'Foto do congelador'],
  despensa: ['Fotografar a despensa', 'Foto da despensa'],
};

export function ShelfEntry() {
  const ids = useId();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const section = useRef<HTMLElement>(null);
  const camera = hasCamera();
  const [place, setPlace] = useState<Location>('frigorifico');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // "/adicionar#inventario" (from the empty home screen) lands here.
  useEffect(() => {
    if (hash === '#inventario') section.current?.scrollIntoView({ block: 'start' });
  }, [hash]);

  const add = (image: string) =>
    setPhotos((current) => [...current, image].slice(0, MAX_RECEIPT_PARTS));

  const read = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await readShelf(photos, place);
      if (!result.drafts.length) {
        setError('Não reconheci alimentos nestas fotos. Tenta com mais luz e mais de perto.');
        return;
      }
      setPendingReview({ ...result, drafts: await markTracked(result.drafts), source: 'shelf' });
      navigate('/rever');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Algo correu mal. Tenta outra vez.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section ref={section} id="inventario" className="shelf-entry" aria-labelledby={`${ids}-title`}>
      <h2 className="section-title" id={`${ids}-title`}>
        Primeiro inventário
      </h2>
      <p className="hint">
        A casa já está cheia? Fotografa o frigorífico, o congelador ou a despensa e a app faz a
        lista do que vê. Depois confirmas tudo, sobretudo as datas.
      </p>

      <fieldset className="field">
        <legend>O que vais fotografar</legend>
        <div className="segmented">
          {LOCATIONS.map((option) => (
            <label key={option}>
              <input
                type="radio"
                name={`${ids}-place`}
                checked={place === option}
                disabled={busy}
                onChange={() => setPlace(option)}
              />
              <span>{LOCATION_LABELS[option]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {photos.length > 0 && (
        <>
          <p className="receipt-parts-title" role="status">
            {photos.length === 1
              ? `${LOCATION_LABELS[place]}: 1 foto.`
              : `${LOCATION_LABELS[place]}: ${photos.length} fotos, lidas em conjunto.`}
          </p>
          <ol className="receipt-thumbs">
            {photos.map((photo, index) => (
              <li key={index}>
                <img src={`data:image/jpeg;base64,${photo}`} alt={`Foto ${index + 1}`} />
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="receipt-parts-actions">
        {photos.length > 0 && (
          <button type="button" className="primary" disabled={busy} onClick={() => void read()}>
            Fazer a lista
          </button>
        )}
        {photos.length < MAX_RECEIPT_PARTS && (
          <PhotoButton
            className={photos.length ? 'secondary' : 'primary'}
            disabled={busy}
            onPhoto={add}
            onError={setError}
          >
            {photos.length
              ? camera
                ? 'Fotografar outra prateleira'
                : 'Juntar outra foto'
              : FIRST[place][camera ? 0 : 1]}
          </PhotoButton>
        )}
        {photos.length > 0 && (
          <button type="button" className="ghost" disabled={busy} onClick={() => setPhotos([])}>
            Recomeçar
          </button>
        )}
      </div>

      {busy && (
        <BusyNote detail="Pode demorar até um minuto: a app está a ver cada prateleira.">
          A fazer a lista…
        </BusyNote>
      )}
      {error && (
        <p className="note error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
