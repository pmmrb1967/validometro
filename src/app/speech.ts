// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Dictation with the browser's Web Speech API, in European Portuguese. Chrome on Android has
 * it (prefixed); Firefox does not, so the screen offers typing instead.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** The few parts of the API used here (not in every TypeScript DOM library). */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionClass = new () => Recognition;

function recognitionClass(): RecognitionClass | undefined {
  const scope = globalThis as unknown as {
    SpeechRecognition?: RecognitionClass;
    webkitSpeechRecognition?: RecognitionClass;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

export const speechSupported = (): boolean => recognitionClass() !== undefined;

const plain = (text: string) => text.toLocaleLowerCase('pt-PT').replace(/\s+/g, ' ').trim();

/**
 * What was said so far, from every result of the session. Chrome on Android repeats the
 * whole phrase in each new result ("azeite", "azeite virgem", "azeite virgem e sal"), the
 * computer gives only the new part: a result that starts with the one before replaces it,
 * one already inside the one before is dropped.
 */
export function joinTranscripts(transcripts: readonly string[]): string {
  const parts: string[] = [];
  for (const raw of transcripts) {
    const text = raw.trim();
    if (!text) continue;
    const last = parts.at(-1);
    if (last !== undefined && plain(text).startsWith(plain(last))) parts[parts.length - 1] = text;
    else if (last === undefined || !plain(last).startsWith(plain(text))) parts.push(text);
  }
  return parts.join(' ');
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'O microfone não está autorizado. Permite-o nas definições do browser.',
  'service-not-allowed': 'O ditado não está disponível neste browser. Escreve a lista.',
  'no-speech': 'Não ouvi nada. Tenta outra vez, mais perto do telemóvel.',
  network: 'O ditado precisa de internet. Escreve a lista.',
};

export function useDictation() {
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const recognition = useRef<Recognition | null>(null);
  /** What was in the box when this dictation started: what is said goes after it. */
  const before = useRef('');

  const stop = useCallback(() => recognition.current?.stop(), []);

  const start = useCallback(() => {
    const Klass = recognitionClass();
    if (!Klass) return;
    const rec = new Klass();
    rec.lang = 'pt-PT';
    rec.continuous = true;
    rec.interimResults = true;
    before.current = text ? `${text.trim()} ` : '';
    rec.onresult = (event) => {
      // All of the session each time (not from resultIndex): see joinTranscripts.
      const said = Array.from(event.results, (result) => result[0]?.transcript ?? '');
      setText(`${before.current}${joinTranscripts(said)}`.trimStart());
    };
    rec.onerror = (event) => {
      if (event.error !== 'aborted')
        setError(ERRORS[event.error] ?? 'O ditado falhou. Escreve a lista.');
    };
    rec.onend = () => setListening(false);
    setError(undefined);
    recognition.current = rec;
    rec.start();
    setListening(true);
  }, [text]);

  useEffect(() => () => recognition.current?.stop(), []);

  return { listening, text, setText, error, start, stop };
}
