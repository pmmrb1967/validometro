// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The fast ways in: a photo of the receipt, or saying what was bought. Both end on the same
 * review screen; nothing is saved before the user confirms.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ApiError, readReceipt, readSpoken, type ReadingResult } from '../api';
import { shrinkPhoto } from '../image';
import { speechSupported, useDictation } from '../speech';
import { setPendingReview, type ReadingSource } from '../store/review';
import { PhotoButton } from './PhotoButton';

/** Where public/push-sw.js leaves a shared receipt until it is read. */
const SHARE_CACHE = 'validometro-partilha';
const SHARED_RECEIPT = '/partilha/talao';

const SHARE_ERRORS: Record<string, string> = {
  vazia: 'O que partilhaste não tem uma imagem. Partilha a foto ou a captura do talão.',
  erro: 'Não consegui abrir o que partilhaste. Tenta outra vez ou fotografa o talão.',
  'sem-app':
    'Para partilhar talões com o Validómetro, instala a app no ecrã principal e abre-a uma vez.',
};

/** The shared image, taken out of the cache: it is read once and not kept. */
async function takeSharedReceipt(): Promise<Blob | null> {
  if (!('caches' in window)) return null;
  const cache = await caches.open(SHARE_CACHE);
  const response = await cache.match(SHARED_RECEIPT);
  await cache.delete(SHARED_RECEIPT);
  return response ? response.blob() : null;
}

export function QuickEntry() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const shared = params.get('partilha');
  const [busy, setBusy] = useState<string>();
  // A share that could not be read comes with its reason (public/push-sw.js).
  const [error, setError] = useState<string | undefined>(() =>
    shared && shared !== 'talao' ? (SHARE_ERRORS[shared] ?? SHARE_ERRORS.erro) : undefined,
  );
  const [voiceOpen, setVoiceOpen] = useState(false);
  const dictation = useDictation();
  const canDictate = speechSupported();
  const handled = useRef(false);

  const run = async (label: string, source: ReadingSource, read: () => Promise<ReadingResult>) => {
    setBusy(label);
    setError(undefined);
    try {
      const result = await read();
      if (!result.drafts.length) {
        setError(
          source === 'receipt'
            ? 'Não encontrei alimentos neste talão. Tenta outra foto, direita e com luz.'
            : 'Não percebi nenhum alimento. Tenta dizer, por exemplo: "iogurtes, leite e frango".',
        );
        return;
      }
      setPendingReview({ ...result, source });
      navigate('/rever');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Algo correu mal. Tenta outra vez.');
    } finally {
      setBusy(undefined);
    }
  };

  // A receipt shared from another app (public/push-sw.js): read it as if just photographed.
  useEffect(() => {
    if (!shared || handled.current) return;
    handled.current = true;
    setParams({}, { replace: true });
    if (shared !== 'talao') return;
    void takeSharedReceipt()
      .then((blob) => (blob ? shrinkPhoto(blob) : null))
      .then((image) => {
        if (image) void run('A ler o talão partilhado…', 'receipt', () => readReceipt(image));
        else setError(SHARE_ERRORS.erro);
      })
      .catch(() => setError(SHARE_ERRORS.erro));
    // run and setParams are stable enough here: this runs once per share.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared]);

  const readVoice = () => {
    dictation.stop();
    const text = dictation.text.trim();
    if (text.length < 2) return;
    void run('A perceber a lista…', 'voice', () => readSpoken(text));
  };

  return (
    <section className="quick-entry" aria-label="Registar compras">
      <div className="quick-buttons">
        <PhotoButton
          className="primary"
          disabled={busy !== undefined}
          onPhoto={(image) => void run('A ler o talão…', 'receipt', () => readReceipt(image))}
          onError={setError}
        >
          Fotografar talão
        </PhotoButton>
        <button
          type="button"
          className="secondary"
          disabled={busy !== undefined}
          aria-expanded={voiceOpen}
          onClick={() => {
            const opening = !voiceOpen;
            setVoiceOpen(opening);
            if (opening && canDictate) dictation.start();
            if (!opening) dictation.stop();
          }}
        >
          {canDictate ? 'Ditar compras' : 'Escrever lista'}
        </button>
      </div>

      <p className="hint">
        Talão digital? Na app do supermercado, partilha a imagem ou a captura do talão e escolhe o
        Validómetro (com a app instalada, em Android).
      </p>

      {voiceOpen && (
        <div className="voice-panel">
          <label className="field">
            <span>{dictation.listening ? 'A ouvir… diz o que compraste' : 'O que compraste'}</span>
            <textarea
              rows={3}
              value={dictation.text}
              onChange={(event) => dictation.setText(event.target.value)}
              placeholder="Iogurtes, um frango, alface e o leite que acaba dia 20"
            />
          </label>
          <div className="row">
            {canDictate && (
              <button
                type="button"
                className="ghost"
                onClick={dictation.listening ? dictation.stop : dictation.start}
              >
                {dictation.listening ? 'Parar' : 'Ditar mais'}
              </button>
            )}
            <button
              type="button"
              className="primary"
              disabled={busy !== undefined || dictation.text.trim().length < 2}
              onClick={readVoice}
            >
              Rever lista
            </button>
          </div>
          {dictation.error && <p className="note">{dictation.error}</p>}
        </div>
      )}

      {busy && (
        <p className="note" role="status">
          {busy}
        </p>
      )}
      {error && (
        <p className="note error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
