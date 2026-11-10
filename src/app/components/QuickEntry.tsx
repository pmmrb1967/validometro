// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The fast ways in: a photo of the receipt, a receipt file (PDF or image, e.g. the digital
 * receipt from the supermarket), or saying what was bought. All end on the same review
 * screen; nothing is saved before the user confirms.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ApiError, readReceipt, readReceiptText, readSpoken, type ReadingResult } from '../api';
import { shrinkPhoto } from '../image';
import { speechSupported, useDictation } from '../speech';
import { setPendingReview, type ReadingSource } from '../store/review';
import { PhotoButton } from './PhotoButton';

/** Where public/push-sw.js leaves a shared receipt until it is read. */
const SHARE_CACHE = 'validometro-partilha';
const SHARED_RECEIPT = '/partilha/talao';

const SHARE_ERRORS: Record<string, string> = {
  vazia: 'O que partilhaste não é uma imagem nem um PDF. Partilha o talão em PDF ou uma captura.',
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
  const fileInput = useRef<HTMLInputElement>(null);

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

  /** A receipt file: a PDF is read as text (or as a picture, when scanned); an image as a photo. */
  const readFile = async (file: Blob) => {
    setError(undefined);
    if (file.type === 'application/pdf') {
      setBusy('A abrir o PDF…');
      let pdf;
      try {
        const { readPdfReceipt } = await import('../pdf');
        pdf = await readPdfReceipt(file);
      } catch {
        pdf = null;
      }
      setBusy(undefined);
      if (!pdf) {
        setError('Não consegui abrir este PDF. Tenta outro, ou fotografa o talão.');
        return;
      }
      const reading = pdf;
      await run('A ler o talão…', 'receipt', () =>
        'text' in reading ? readReceiptText(reading.text) : readReceipt(reading.image),
      );
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Escolhe um talão em PDF ou uma imagem (foto ou captura).');
      return;
    }
    const image = await shrinkPhoto(file);
    if (image) await run('A ler o talão…', 'receipt', () => readReceipt(image));
    else setError('Não consegui abrir essa imagem. Tenta outra.');
  };

  // A receipt shared from another app (public/push-sw.js): read it as if just photographed.
  useEffect(() => {
    if (!shared || handled.current) return;
    handled.current = true;
    setParams({}, { replace: true });
    if (shared !== 'talao') return;
    void takeSharedReceipt()
      .then((blob) => {
        if (blob) void readFile(blob);
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
          onClick={() => fileInput.current?.click()}
        >
          Talão em ficheiro
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,image/*"
          hidden
          aria-label="Talão em PDF ou imagem"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void readFile(file);
          }}
        />
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
        Talão digital? Escolhe o PDF (do email ou da app do supermercado) em “Talão em ficheiro”, ou
        partilha-o diretamente com o Validómetro (com a app instalada, em Android).
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
