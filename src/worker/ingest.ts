// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Receipt, voice and printed date, read by the AI and returned as drafts for review. Nothing
 * is saved here: photos are forwarded and dropped, never stored or logged (principle 7).
 *
 * Without accounts yet, the user's own key comes with each request (header `x-ai-key`), is
 * used for that call only and never stored on the server.
 *
 * Texts (a digital receipt, a spoken list) come anonymized from the phone and are anonymized
 * again here (src/domain/anonymize.ts): an old copy of the app or a script may not have.
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { anonymize } from '../domain/anonymize';
import { lisbonDate } from '../domain/dates';
import {
  aliasKey,
  plausiblePrintedDate,
  purchaseDay,
  toDraft,
  type DraftItem,
} from '../domain/drafts';
import {
  DATE_PROMPT,
  RECEIPT_PARTS_NOTE,
  RECEIPT_PROMPT,
  RECEIPT_TEXT_PROMPT,
  RECIPES_PROMPT,
  SHELF_PROMPT,
  TEST_PROMPT,
  VOICE_PROMPT,
} from '../ai/prompts';
import { anthropic, CLAUDE_MODELS, type ClaudeModel } from '../ai/providers/anthropic';
import { gemini } from '../ai/providers/gemini';
import { workersAi } from '../ai/providers/workers-ai';
import {
  dateSchema,
  receiptSchema,
  recipesSchema,
  shelfSchema,
  testSchema,
  voiceSchema,
} from '../ai/schemas';
import { placeDraft } from '../domain/shelf';
import { structured, type UsageRecorder } from '../ai/structured';
import { AiError, PROVIDERS, type AiErrorCode, type AiProvider, type Operation } from '../ai/types';
import { lookupAliases, saveAliases } from './aliases';
import { storedAi } from './account';
import type { AppEnv } from './session';
import { addFreeNeurons, claimFreeReading, type FreeClaim } from './free-ai';
import { freeQuotaLeft, recordUsage } from './usage';

export const ingest = new Hono<AppEnv>();

const MESSAGES: Record<AiErrorCode, [number, string]> = {
  no_key: [400, 'Falta a chave da API. Junta-a nas Definições ou usa a leitura gratuita.'],
  invalid_key: [401, 'A chave da API foi recusada. Confirma-a nas Definições.'],
  no_credit: [402, 'A conta dessa chave não tem saldo. Carrega-a ou usa a leitura gratuita.'],
  rate_limited: [429, 'Muitos pedidos seguidos. Tenta daqui a um minuto.'],
  quota: [
    429,
    'A leitura gratuita de hoje esgotou. Usa a tua própria chave (Definições) ou escreve à mão.',
  ],
  device_quota: [
    429,
    'Já usaste a tua parte da leitura gratuita de hoje. Amanhã há mais; até lá, usa a tua própria chave (Definições) ou escreve à mão.',
  ],
  address_quota: [
    429,
    'Hoje já se fizeram muitas leituras gratuitas a partir desta rede. Usa a tua própria chave (Definições) ou escreve à mão; amanhã há mais.',
  ],
  no_device: [400, 'Atualiza a app (fecha-a e volta a abri-la) para usar a leitura gratuita.'],
  unavailable: [503, 'O serviço de IA não respondeu. Tenta de novo ou escreve à mão.'],
  invalid_output: [502, 'Não consegui ler isto. Tenta outra foto, com mais luz, ou escreve à mão.'],
  refused: [422, 'O serviço de IA não quis ler isto. Tenta outra foto ou escreve à mão.'],
  too_large: [413, 'A foto é demasiado grande. Tenta de novo.'],
};

/** The recipes have no photo to retake nor anything to write by hand. */
const RECIPE_MESSAGES: Partial<Record<AiErrorCode, [number, string]>> = {
  quota: [
    429,
    'A IA gratuita de hoje esgotou. Usa a tua própria chave (Definições) ou volta amanhã.',
  ],
  device_quota: [
    429,
    'Já usaste a tua parte da IA gratuita de hoje. Usa a tua própria chave (Definições) ou volta amanhã.',
  ],
  address_quota: [
    429,
    'Hoje já se fizeram muitas leituras gratuitas a partir desta rede. Usa a tua própria chave (Definições) ou volta amanhã.',
  ],
  unavailable: [503, 'O serviço de IA não respondeu. Tenta outra vez daqui a pouco.'],
  invalid_output: [502, 'Não consegui pensar em receitas desta vez. Tenta outra vez.'],
  refused: [422, 'O serviço de IA não quis sugerir receitas. Tenta outra vez.'],
};

function aiFailure(c: Context<AppEnv>, operation: Operation, err: unknown) {
  if (!(err instanceof AiError)) throw err;
  // The code and the provider's status only: never the key, the image or the model's text.
  console.warn('AI call failed', operation, err.code, err.message);
  const [status, error] =
    operation === 'recipes'
      ? (RECIPE_MESSAGES[err.code] ?? MESSAGES[err.code])
      : MESSAGES[err.code];
  return c.json({ error, code: err.code }, status as 400);
}

interface Reader {
  provider: AiProvider;
  /** Counts each call in `ai_usage` and, on the free AI, in this device's share. */
  record: UsageRecorder;
}

/**
 * Who reads this request: the user's own key when sent, Workers AI otherwise. The free AI
 * takes one reading from the device's (or account's) share first (free-ai.ts).
 */
async function readerFor(c: Context<AppEnv>, operation: Operation): Promise<Reader> {
  let id = c.req.header('x-ai-provider');
  let key = c.req.header('x-ai-key')?.trim();
  let model = c.req.header('x-ai-model');
  // Signed in and no key sent: the one saved with the account (sealed in D1), if it is for
  // this provider.
  const user = c.get('user');
  if (user && !key) {
    const saved = await storedAi(c.env, user);
    if (!id || saved.provider === id) {
      id = saved.provider;
      key = saved.key ?? undefined;
      model ??= saved.model ?? undefined;
    }
  }
  id ??= 'workers-ai';
  if (!(PROVIDERS as readonly string[]).includes(id)) throw new AiError('no_key', 'provider');
  let provider: AiProvider;
  let claim: FreeClaim | null = null;
  if (id === 'workers-ai') {
    if (!(await freeQuotaLeft(c.env.DB))) throw new AiError('quota', 'local count');
    claim = await claimFreeReading(c);
    provider = workersAi(c.env.AI);
  } else {
    if (!key || key.length > 300) throw new AiError('no_key', id);
    if (id === 'gemini') {
      provider = gemini(key);
    } else {
      const known = (CLAUDE_MODELS as readonly string[]).includes(model ?? '');
      provider = anthropic(key, known ? (model as ClaudeModel) : undefined);
    }
  }
  const db = c.env.DB;
  const record: UsageRecorder = (usage, ok) =>
    Promise.all([
      recordUsage(db, provider.id, operation, usage, ok, user?.id),
      claim ? addFreeNeurons(db, claim, usage.units ?? 0) : undefined,
    ]).then(
      () => undefined,
      () => undefined,
    );
  return { provider, record };
}

/** About 1600 px JPEG at 0.7 is ~300 KB; 4 MB of base64 leaves room and stops abuse. */
const imageBody = z.object({
  image: z
    .string()
    .min(100)
    .max(4_000_000)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});

async function imageFrom(c: Context<AppEnv>) {
  const body = imageBody.safeParse(await c.req.json().catch(() => null));
  return body.success ? { mime: 'image/jpeg' as const, base64: body.data.image } : null;
}

export interface ReceiptDrafts {
  store: string | null;
  date: string | null;
  drafts: DraftItem[];
}

/** A receipt as a photo ({image}) or as the text of a digital receipt PDF ({text}). */
/** Up to four parts of one long receipt, about 1.2 MB of photos in all. */
export const MAX_RECEIPT_PARTS = 4;
const receiptBody = z.union([
  imageBody,
  z.object({ images: z.array(imageBody.shape.image).min(1).max(MAX_RECEIPT_PARTS) }),
  z.object({ text: z.string().trim().min(20).max(30_000) }),
]);

/** One photo, or the parts of a long receipt with a note on how they join. */
function receiptPhotos(parts: string[]) {
  return {
    prompt: (parts.length > 1 ? RECEIPT_PARTS_NOTE(parts.length) : '') + RECEIPT_PROMPT.prompt,
    images: parts.map((part) => ({ mime: 'image/jpeg' as const, base64: part })),
  };
}

ingest.post('/ingest/receipt', async (c) => {
  const body = receiptBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Talão inválido.' }, 400);
  const input = body.data;
  try {
    const { provider, record } = await readerFor(c, 'receipt');
    const reading = await structured(
      provider,
      {
        operation: 'receipt',
        system: RECEIPT_PROMPT.system,
        ...('text' in input
          ? { prompt: RECEIPT_TEXT_PROMPT.prompt(anonymize(input.text).text) }
          : receiptPhotos('image' in input ? [input.image] : input.images)),
        schema: receiptSchema,
        schemaName: 'receipt',
        maxTokens: 4000,
      },
      record,
    );
    const today = lisbonDate(new Date());
    const from = purchaseDay(reading.date, today);
    const aliases = await lookupAliases(
      c.env.DB,
      reading.lines.flatMap((line) => (line.raw ? [line.raw] : [])),
      reading.store,
    );
    const drafts = reading.lines.map((line) =>
      toDraft(line, line.raw ? aliases.get(aliasKey(line.raw)) : undefined, today, from),
    );
    return c.json({ store: reading.store, date: reading.date, drafts } satisfies ReceiptDrafts);
  } catch (err) {
    return aiFailure(c, 'receipt', err);
  }
});

const voiceBody = z.object({ text: z.string().trim().min(2).max(2000) });

ingest.post('/ingest/voice', async (c) => {
  const body = voiceBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Não percebi nada. Tenta outra vez.' }, 400);
  try {
    const { provider, record } = await readerFor(c, 'voice');
    const today = lisbonDate(new Date());
    const reading = await structured(
      provider,
      {
        operation: 'voice',
        system: VOICE_PROMPT.system,
        prompt: VOICE_PROMPT.prompt(anonymize(body.data.text).text, today),
        schema: voiceSchema,
        schemaName: 'voice',
        maxTokens: 2000,
      },
      record,
    );
    const drafts = reading.lines.map((line) => toDraft({ ...line, raw: null }, undefined, today));
    return c.json({ store: null, date: null, drafts } satisfies ReceiptDrafts);
  } catch (err) {
    return aiFailure(c, 'voice', err);
  }
});

/** The first inventory: one to four photos of one place (fridge, freezer or pantry). */
const shelfBody = z.object({
  images: z.array(imageBody.shape.image).min(1).max(MAX_RECEIPT_PARTS),
  location: z.enum(['frigorifico', 'congelador', 'despensa']),
});

ingest.post('/ingest/shelf', async (c) => {
  const body = shelfBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Fotos inválidas.' }, 400);
  const { images, location } = body.data;
  try {
    const { provider, record } = await readerFor(c, 'shelf');
    const today = lisbonDate(new Date());
    const reading = await structured(
      provider,
      {
        operation: 'shelf',
        system: SHELF_PROMPT.system,
        prompt: SHELF_PROMPT.prompt(location, today, images.length),
        images: images.map((base64) => ({ mime: 'image/jpeg' as const, base64 })),
        schema: shelfSchema,
        schemaName: 'shelf',
        maxTokens: 4000,
      },
      record,
    );
    const drafts = reading.lines.map((line) =>
      placeDraft(
        toDraft({ ...line, raw: null, expires_at: null }, undefined, today),
        location,
        today,
        plausiblePrintedDate(line.expires_at, today),
      ),
    );
    return c.json({ store: null, date: null, drafts } satisfies ReceiptDrafts);
  } catch (err) {
    return aiFailure(c, 'shelf', err);
  }
});

ingest.post('/ingest/date', async (c) => {
  const image = await imageFrom(c);
  if (!image) return c.json({ error: 'Foto inválida.' }, 400);
  try {
    const { provider, record } = await readerFor(c, 'date');
    const today = lisbonDate(new Date());
    const reading = await structured(
      provider,
      {
        operation: 'date',
        system: DATE_PROMPT.system,
        prompt: DATE_PROMPT.prompt(today),
        image,
        schema: dateSchema,
        schemaName: 'printed_date',
        maxTokens: 200,
      },
      record,
    );
    const date = plausiblePrintedDate(reading.date, today);
    if (!date) return c.json({ error: 'Não encontrei uma data legível. Escreve-a à mão.' }, 422);
    return c.json({ date, kind: reading.kind });
  } catch (err) {
    return aiFailure(c, 'date', err);
  }
});

const recipesBody = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        days: z.number().int().min(-60).max(60),
      }),
    )
    .min(1)
    .max(20),
  /** The pantry's long-life stock, to cook with too (fewer things in "falta"). */
  pantry: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
});

/** "O que cozinhar hoje?": 2–3 simple recipes with what is about to go off. Nothing is stored. */
ingest.post('/ai/recipes', async (c) => {
  const body = recipesBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Não há alimentos a aproveitar.' }, 400);
  try {
    const { provider, record } = await readerFor(c, 'recipes');
    const reading = await structured(
      provider,
      {
        operation: 'recipes',
        system: RECIPES_PROMPT.system,
        prompt: RECIPES_PROMPT.prompt(body.data.items, body.data.pantry),
        schema: recipesSchema,
        schemaName: 'recipes',
        maxTokens: 2500,
      },
      record,
    );
    return c.json(reading);
  } catch (err) {
    return aiFailure(c, 'recipes', err);
  }
});

/** "Testar ligação" in the settings: a tiny call that proves the key works. */
ingest.post('/ai/test', async (c) => {
  try {
    const { provider, record } = await readerFor(c, 'test');
    await structured(
      provider,
      {
        operation: 'test',
        system: TEST_PROMPT.system,
        prompt: TEST_PROMPT.prompt,
        schema: testSchema,
        schemaName: 'test',
        maxTokens: 50,
      },
      record,
    );
    return c.json({ ok: true, provider: provider.id });
  } catch (err) {
    return aiFailure(c, 'test', err);
  }
});

const aliasesBody = z.object({
  store: z.string().max(80).nullable(),
  lines: z
    .array(
      z.object({
        raw: z.string().min(1).max(200),
        name: z.string().trim().min(1).max(120),
        category: z.string().max(40).nullable(),
        perishable: z.boolean(),
      }),
    )
    .max(150),
});

/** The review was confirmed: teach the dictionary what each receipt line meant. */
ingest.post('/aliases', async (c) => {
  const body = aliasesBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Pedido inválido.' }, 400);
  const saved = await saveAliases(c.env.DB, body.data.store, body.data.lines);
  return c.json({ saved });
});
