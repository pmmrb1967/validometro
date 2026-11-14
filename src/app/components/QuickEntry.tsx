// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The fast ways in: a photo of the receipt, a receipt file (PDF or image, e.g. the digital
 * receipt from the supermarket), or saying what was bought. All end on the same review
 * screen; nothing is saved before the user confirms.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  ApiError,
  MAX_RECEIPT_PARTS,
  readReceipt,
  readReceiptText,
  readSpoken,
  type ReadingResult,
} from '../api';
import { formatShortDate } from '../../domain/dates';
import { receiptQrHash, type ReceiptQr, type SeenReceipt } from '../../domain/receipts';
import { hasCamera, keepAboveQr, MIN_KEEP, shrinkPhoto } from '../image';
import { receiptQrInPhoto, type QrInPhoto } from '../receipt-qr';
import { receiptWithQr } from '../store/receipts';
import { speechSupported, useDictation } from '../speech';
import { markTracked, setPendingReview, type ReadingSource } from '../store/review';
import { BusyNote } from './BusyNote';
import { PhotoButton } from './PhotoButton';
import { AiCostNote } from './AiCostNote';

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
  const camera = hasCamera();
  const handled = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  /**
   * The photos of the receipt being put together, top to bottom (a long receipt in parts, as
   * the pages of an invoice in Faturómetro). Read in one request, as one receipt.
   */
  const [parts, setParts] = useState<string[]>([]);
  /**
   * The same photos as taken: to look for the QR code, and to draw the last one again
   * without its end. Gone with the page.
   */
  const originals = useRef<Blob[]>([]);
  /** The AT's QR code, found in the photos as they were added. */
  const found = useRef<ReceiptQr | null>(null);
  /**
   * How much of the last photo is sent, from the top. The end of a receipt (after the total)
   * has the buyer's tax number (also inside the QR code), the cards and the loyalty points:
   * the reading does not need it, so it can stay on the phone.
   */
  const [keep, setKeep] = useState(1);
  /** Whether `keep` was put at the QR code by the app (the hint says so). */
  const [cutAtQr, setCutAtQr] = useState(false);
  const addParts = async (images: string[], taken: Blob[]) => {
    const room = MAX_RECEIPT_PARTS - originals.current.length;
    const added = taken.slice(0, room);
    if (!added.length) return;
    setParts((current) => [...current, ...images.slice(0, room)]);
    originals.current = [...originals.current, ...added];
    setKeep(1);
    setCutAtQr(false);
    const hit = await qrOf(added);
    if (!hit) return;
    found.current = hit.qr;
    // In the newest photo, the end of the receipt: cut there.
    if (hit.index === added.length - 1) {
      const kept = keepAboveQr(hit.top);
      setKeep(kept);
      setCutAtQr(kept < 1);
    }
  };
  const clearParts = () => {
    setParts([]);
    originals.current = [];
    found.current = null;
    setKeep(1);
    setCutAtQr(false);
  };
  /** This receipt was saved before (its QR code): read again only if asked. */
  const [seen, setSeen] = useState<{ receipt: SeenReceipt; again: () => void }>();

  const run = async (
    label: string,
    source: ReadingSource,
    read: () => Promise<ReadingResult>,
    qr?: { hash: string; date: string | null; total?: number | null },
  ) => {
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
      setPendingReview({
        ...result,
        drafts: await markTracked(result.drafts),
        source,
        ...(qr ? { qr } : {}),
      });
      navigate('/rever');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Algo correu mal. Tenta outra vez.');
    } finally {
      setBusy(undefined);
    }
  };

  /**
   * A receipt about to be read: with its QR code, known at once if it was saved before, and
   * then the AI is not asked unless the user says so (domain/receipts.ts).
   */
  const readReceiptOnce = async (
    label: string,
    qr: ReceiptQr | null,
    read: () => Promise<ReadingResult>,
  ) => {
    setSeen(undefined);
    const hash = qr ? await receiptQrHash(qr) : null;
    const known = hash ? await receiptWithQr(hash) : undefined;
    const go = () =>
      void run(
        label,
        'receipt',
        read,
        hash ? { hash, date: qr?.date ?? null, total: qr?.total ?? null } : undefined,
      );
    if (known) setSeen({ receipt: known, again: go });
    else go();
  };

  /**
   * The QR code in the photos as taken (none, or unreadable: null), the last photo first (the
   * code is at the end), with which photo it was in and where.
   */
  const qrOf = async (photos: Blob[]): Promise<(QrInPhoto & { index: number }) | null> => {
    setBusy('A procurar o código QR do talão…');
    try {
      for (let index = photos.length - 1; index >= 0; index--) {
        const hit = await receiptQrInPhoto(photos[index]!);
        if (hit) return { ...hit, index };
      }
      return null;
    } catch {
      return null;
    } finally {
      setBusy(undefined);
    }
  };

  /**
   * Receipt files: a PDF is read at once, as text (or as a picture, when scanned); images join
   * the receipt's photos, read when the user says so. `now`: read a single image at once (a
   * share from another app).
   */
  const readFiles = async (files: Blob[], now = false) => {
    setError(undefined);
    const pdf = files.find((file) => file.type === 'application/pdf');
    if (pdf) return readFile(pdf);
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (!images.length) {
      setError('Escolhe um talão em PDF ou uma imagem (foto ou captura).');
      return;
    }
    const small = (await Promise.all(images.map((file) => shrinkPhoto(file)))).filter(
      (image): image is string => image !== null,
    );
    if (!small.length) {
      setError('Não consegui abrir essa imagem. Tenta outra.');
      return;
    }
    if (now && small.length === 1 && !parts.length) {
      // Shared from another app, read at once: cut at the QR code with no one to ask.
      const hit = await qrOf(images);
      const kept = keepAboveQr(hit?.top ?? null);
      const image = kept < 1 ? await shrinkPhoto(images[0]!, kept) : small[0]!;
      if (!image) {
        setError('Não consegui abrir essa imagem. Tenta outra.');
        return;
      }
      await readReceiptOnce('A ler o talão…', hit?.qr ?? null, () => readReceipt(image));
      return;
    }
    await addParts(small, images);
  };

  /** A PDF receipt: as text when it has one; else its first page as a picture. */
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
      await readReceiptOnce('A ler o talão…', reading.qr, () =>
        'text' in reading ? readReceiptText(reading.text) : readReceipt(reading.image),
      );
      return;
    }
  };

  /** The photos as sent: the last one drawn again without its end, when it is cut. */
  const readParts = async () => {
    let images = parts;
    if (keep < 1) {
      const last = parts.length - 1;
      const cut = await shrinkPhoto(originals.current[last]!, keep);
      // Never the whole photo instead: what was cut off was meant to stay here.
      if (!cut) {
        setError('Não consegui cortar a foto. Tira-a outra vez.');
        return;
      }
      images = [...parts.slice(0, last), cut];
    }
    await readReceiptOnce(
      parts.length > 1 ? `A ler as ${parts.length} partes do talão…` : 'A ler o talão…',
      found.current,
      () => readReceipt(images),
    );
  };

  // A receipt shared from another app (public/push-sw.js): read it as if just photographed.
  useEffect(() => {
    if (!shared || handled.current) return;
    handled.current = true;
    setParams({}, { replace: true });
    if (shared !== 'talao') return;
    void takeSharedReceipt()
      .then((blob) => {
        if (blob) void readFiles([blob], true);
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
          disabled={busy !== undefined || parts.length > 0}
          onPhoto={(image, original) => void addParts([image], [original])}
          onError={setError}
        >
          {camera ? 'Fotografar talão' : 'Foto do talão'}
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
          multiple
          hidden
          aria-label="Talão em PDF ou imagem"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = '';
            if (files.length) void readFiles(files);
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
      {parts.length === 0 && <AiCostNote operation="receipt" />}

      {seen && (
        <div className="note seen-receipt" role="alert">
          <p>
            Este talão já foi registado
            {seen.receipt.date ? ` (compra de ${formatShortDate(seen.receipt.date)}` : ' ('}
            {seen.receipt.store ? `${seen.receipt.date ? ', ' : ''}${seen.receipt.store}` : ''}
            {seen.receipt.date || seen.receipt.store ? ', ' : ''}
            {seen.receipt.items === 1 ? '1 alimento' : `${seen.receipt.items} alimentos`}). Lê-lo
            outra vez repetia o que já está em casa.
          </p>
          <div className="row wrap">
            <button
              type="button"
              className="primary"
              onClick={() => {
                setSeen(undefined);
                clearParts();
              }}
            >
              Não ler
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                const again = seen.again;
                setSeen(undefined);
                again();
              }}
            >
              Ler na mesma
            </button>
          </div>
        </div>
      )}

      {parts.length > 0 && (
        <div className="receipt-parts" role="group" aria-label="Fotos do talão">
          <p className="receipt-parts-title" role="status">
            {parts.length === 1
              ? 'Talão: 1 foto.'
              : `Talão: ${parts.length} fotos, lidas como um só talão.`}
          </p>
          {/* One photo is shown below, whole, with its cut. */}
          {parts.length > 1 && (
            <ol className="receipt-thumbs">
              {parts.map((part, index) => (
                <li key={index}>
                  <img src={`data:image/jpeg;base64,${part}`} alt={`Parte ${index + 1}`} />
                </li>
              ))}
            </ol>
          )}
          <ReceiptCut
            image={parts[parts.length - 1]!}
            keep={keep}
            atQr={cutAtQr}
            onChange={(kept) => {
              setKeep(kept);
              setCutAtQr(false);
            }}
          />
          <p className="hint">
            {parts.length < MAX_RECEIPT_PARTS
              ? 'Talão comprido? Fotografa a parte seguinte, de cima para baixo, repetindo uma ou duas linhas da anterior.'
              : `Chegaste às ${MAX_RECEIPT_PARTS} partes: lê o talão.`}
          </p>
          <AiCostNote operation="receipt" photos={parts.length} />
          <div className="receipt-parts-actions">
            <button
              type="button"
              className="primary"
              disabled={busy !== undefined}
              onClick={() => void readParts()}
            >
              Ler talão
            </button>
            {parts.length < MAX_RECEIPT_PARTS && (
              <PhotoButton
                className="secondary"
                disabled={busy !== undefined}
                onPhoto={(image, original) => void addParts([image], [original])}
                onError={setError}
              >
                {camera ? 'Fotografar a parte seguinte' : 'Juntar a parte seguinte'}
              </PhotoButton>
            )}
            <button
              type="button"
              className="ghost"
              disabled={busy !== undefined}
              onClick={clearParts}
            >
              Recomeçar
            </button>
          </div>
        </div>
      )}

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
          <AiCostNote operation="voice" />
          {dictation.error && <p className="note">{dictation.error}</p>}
        </div>
      )}

      {busy && (
        <BusyNote detail="Com a leitura gratuita pode demorar até meio minuto.">{busy}</BusyNote>
      )}
      {error && (
        <p className="note error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** Up to this much of the last photo can be cut off (MIN_KEEP of it is always sent). */
const MAX_CUT = Math.round((1 - MIN_KEEP) * 100);

/**
 * The last photo of the receipt, with its end shaded: what stays on the phone. The slider
 * moves the cut; the app puts it at the QR code when it finds one.
 */
function ReceiptCut({
  image,
  keep,
  atQr,
  onChange,
}: {
  image: string;
  keep: number;
  atQr: boolean;
  onChange: (keep: number) => void;
}) {
  const cut = Math.round((1 - keep) * 100);
  return (
    <figure className="receipt-cut">
      <div className="receipt-cut-photo">
        <img src={`data:image/jpeg;base64,${image}`} alt="A última foto do talão" />
        {cut > 0 && (
          <div className="receipt-cut-off" style={{ top: `${100 - cut}%` }}>
            <span>Fica no telemóvel</span>
          </div>
        )}
      </div>
      <figcaption>
        <label className="field">
          <span>Cortar o fim do talão</span>
          <input
            type="range"
            min={0}
            max={MAX_CUT}
            step={1}
            value={cut}
            aria-valuetext={cut ? `${cut} % de baixo fica no telemóvel` : 'Sem corte'}
            onChange={(event) => onChange(1 - Number(event.target.value) / 100)}
          />
        </label>
        <p className="hint">
          {atQr
            ? 'Cortei a partir do código QR, que leva o teu NIF: isso não sai do telemóvel. Sobe o corte até logo abaixo do total para deixar também os cartões e os pontos.'
            : 'Depois do total vêm o teu NIF, os cartões e o código QR, que a leitura não precisa. Sobe o corte até logo abaixo do total e isso fica no telemóvel.'}
        </p>
      </figcaption>
    </figure>
  );
}
