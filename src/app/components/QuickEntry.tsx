// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The fast ways in: a photo of the receipt, or saying what was bought. Both end on the same
 * review screen; nothing is saved before the user confirms.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, readReceipt, readSpoken, type ReadingResult } from '../api';
import { speechSupported, useDictation } from '../speech';
import { setPendingReview, type ReadingSource } from '../store/review';
import { PhotoButton } from './PhotoButton';

export function QuickEntry() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const dictation = useDictation();
  const canDictate = speechSupported();

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
