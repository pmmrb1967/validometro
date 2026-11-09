// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Barcode reader: the browser's BarcodeDetector where there is one (Chrome on Android), else
 * zxing-js, loaded only then (Safari/iOS has no BarcodeDetector). Only codes with a valid
 * check digit count, so a misread never fills the form. The code can also be typed.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { isValidGtin } from '../../domain/barcode';

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorClass {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

async function nativeDetector(): Promise<BarcodeDetectorLike | undefined> {
  const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
  if (!Detector) return undefined;
  try {
    const supported = await Detector.getSupportedFormats();
    const formats = FORMATS.filter((format) => supported.includes(format));
    return formats.length > 0 ? new Detector({ formats }) : undefined;
  } catch {
    return undefined;
  }
}

/** Starts reading from the camera into `video`; returns how to stop. */
async function startReading(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
): Promise<() => void> {
  const detector = await nativeDetector();
  if (detector) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const codes = await detector.detect(video);
        const code = codes.map((c) => c.rawValue).find(isValidGtin);
        if (code) onCode(code);
      } catch {
        // A frame that cannot be read yet: try the next one.
      }
      if (!stopped) setTimeout(() => void tick(), 200);
    };
    void tick();
    return () => {
      stopped = true;
      for (const track of stream.getTracks()) track.stop();
    };
  }

  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);
  const hints = new Map([
    [
      DecodeHintType.POSSIBLE_FORMATS,
      [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E],
    ],
  ]);
  const reader = new BrowserMultiFormatReader(hints);
  const controls = await reader.decodeFromConstraints(
    { video: { facingMode: 'environment' }, audio: false },
    video,
    (result) => {
      const code = result?.getText();
      if (code && isValidGtin(code)) onCode(code);
    },
  );
  return () => controls.stop();
}

export function Scanner({
  onCode,
  onClose,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string>();
  const [typed, setTyped] = useState('');
  const done = useRef(false);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    const found = (code: string) => {
      if (done.current) return;
      done.current = true;
      navigator.vibrate?.(60);
      onCode(code);
    };
    startReading(element, found)
      .then((stopReading) => {
        if (cancelled) stopReading();
        else stop = stopReading;
      })
      .catch((err: unknown) => {
        console.warn('Camera unavailable', err);
        setProblem(
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Sem acesso à câmara. Dá permissão nas definições do browser ou escreve o código.'
            : 'Não foi possível usar a câmara. Escreve o código de barras.',
        );
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [onCode]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const code = typed.replace(/\D/g, '');
    if (isValidGtin(code)) onCode(code);
    else setProblem('Esse código não é válido. Confirma os números por baixo das barras.');
  };

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-labelledby="scanner-title">
      <div className="scanner-bar">
        <h2 id="scanner-title">Ler código de barras</h2>
        <button type="button" className="ghost on-dark" onClick={onClose}>
          Fechar
        </button>
      </div>
      <div className="scanner-view">
        <video ref={video} muted playsInline />
        <div className="scanner-frame" aria-hidden="true" />
      </div>
      <form className="scanner-manual" onSubmit={submit}>
        {problem ? (
          <p role="alert">{problem}</p>
        ) : (
          <p>Aponta a câmara para as barras. Também podes escrever o código.</p>
        )}
        <div className="row">
          <input
            inputMode="numeric"
            autoComplete="off"
            placeholder="5601234567892"
            aria-label="Código de barras"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          <button type="submit" className="secondary">
            Procurar
          </button>
        </div>
      </form>
    </div>
  );
}
