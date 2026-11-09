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
  const finalText = useRef('');

  const stop = useCallback(() => recognition.current?.stop(), []);

  const start = useCallback(() => {
    const Klass = recognitionClass();
    if (!Klass) return;
    const rec = new Klass();
    rec.lang = 'pt-PT';
    rec.continuous = true;
    rec.interimResults = true;
    finalText.current = text ? `${text.trim()} ` : '';
    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!;
        const chunk = result[0]?.transcript ?? '';
        if (result.isFinal) finalText.current += `${chunk.trim()} `;
        else interim += chunk;
      }
      setText(`${finalText.current}${interim}`.trimStart());
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
