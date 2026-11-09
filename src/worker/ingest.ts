// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Receipt, voice and printed date, read by the AI and returned as drafts for review. Nothing
 * is saved here: photos are forwarded and dropped, never stored or logged (principle 7).
 *
 * Without accounts yet, the user's own key comes with each request (header `x-ai-key`), is
 * used for that call only and never stored on the server.
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { lisbonDate } from '../domain/dates';
import {
  aliasKey,
  plausiblePrintedDate,
  purchaseDay,
  toDraft,
  type DraftItem,
} from '../domain/drafts';
import { DATE_PROMPT, RECEIPT_PROMPT, TEST_PROMPT, VOICE_PROMPT } from '../ai/prompts';
import { anthropic, CLAUDE_MODELS, type ClaudeModel } from '../ai/providers/anthropic';
import { gemini } from '../ai/providers/gemini';
import { workersAi } from '../ai/providers/workers-ai';
import { dateSchema, receiptSchema, testSchema, voiceSchema } from '../ai/schemas';
import { structured } from '../ai/structured';
import { AiError, PROVIDERS, type AiErrorCode, type AiProvider, type Operation } from '../ai/types';
import { lookupAliases, saveAliases } from './aliases';
import { freeQuotaLeft, recordUsage } from './usage';

type AppEnv = { Bindings: Env };

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
  unavailable: [503, 'O serviço de IA não respondeu. Tenta de novo ou escreve à mão.'],
  invalid_output: [502, 'Não consegui ler isto. Tenta outra foto, com mais luz, ou escreve à mão.'],
  refused: [422, 'O serviço de IA não quis ler isto. Tenta outra foto ou escreve à mão.'],
  too_large: [413, 'A foto é demasiado grande. Tenta de novo.'],
};

function aiFailure(c: Context<AppEnv>, operation: Operation, err: unknown) {
  if (!(err instanceof AiError)) throw err;
  // The code and the provider's status only: never the key, the image or the model's text.
  console.warn('AI call failed', operation, err.code, err.message);
  const [status, error] = MESSAGES[err.code];
  return c.json({ error, code: err.code }, status as 400);
}

/** Which provider this request uses: the user's own key when sent, Workers AI otherwise. */
async function providerFor(c: Context<AppEnv>): Promise<AiProvider> {
  const id = c.req.header('x-ai-provider') ?? 'workers-ai';
  if (!(PROVIDERS as readonly string[]).includes(id)) throw new AiError('no_key', 'provider');
  if (id === 'workers-ai') {
    if (!(await freeQuotaLeft(c.env.DB))) throw new AiError('quota', 'local count');
    return workersAi(c.env.AI);
  }
  const key = c.req.header('x-ai-key')?.trim();
  if (!key || key.length > 300) throw new AiError('no_key', id);
  if (id === 'gemini') return gemini(key);
  const model = c.req.header('x-ai-model');
  const known = (CLAUDE_MODELS as readonly string[]).includes(model ?? '');
  return anthropic(key, known ? (model as ClaudeModel) : undefined);
}

function recorder(c: Context<AppEnv>, provider: AiProvider, operation: Operation) {
  return (units: number, ok: boolean) =>
    recordUsage(c.env.DB, provider.id, operation, units, ok).catch(() => undefined);
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

ingest.post('/ingest/receipt', async (c) => {
  const image = await imageFrom(c);
  if (!image) return c.json({ error: 'Foto inválida.' }, 400);
  try {
    const provider = await providerFor(c);
    const reading = await structured(
      provider,
      {
        operation: 'receipt',
        system: RECEIPT_PROMPT.system,
        prompt: RECEIPT_PROMPT.prompt,
        image,
        schema: receiptSchema,
        schemaName: 'receipt',
        maxTokens: 4000,
      },
      recorder(c, provider, 'receipt'),
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
    const provider = await providerFor(c);
    const today = lisbonDate(new Date());
    const reading = await structured(
      provider,
      {
        operation: 'voice',
        system: VOICE_PROMPT.system,
        prompt: VOICE_PROMPT.prompt(body.data.text, today),
        schema: voiceSchema,
        schemaName: 'voice',
        maxTokens: 2000,
      },
      recorder(c, provider, 'voice'),
    );
    const drafts = reading.lines.map((line) => toDraft({ ...line, raw: null }, undefined, today));
    return c.json({ store: null, date: null, drafts } satisfies ReceiptDrafts);
  } catch (err) {
    return aiFailure(c, 'voice', err);
  }
});

ingest.post('/ingest/date', async (c) => {
  const image = await imageFrom(c);
  if (!image) return c.json({ error: 'Foto inválida.' }, 400);
  try {
    const provider = await providerFor(c);
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
      recorder(c, provider, 'date'),
    );
    const date = plausiblePrintedDate(reading.date, today);
    if (!date) return c.json({ error: 'Não encontrei uma data legível. Escreve-a à mão.' }, 422);
    return c.json({ date, kind: reading.kind });
  } catch (err) {
    return aiFailure(c, 'date', err);
  }
});

/** "Testar ligação" in the settings: a tiny call that proves the key works. */
ingest.post('/ai/test', async (c) => {
  try {
    const provider = await providerFor(c);
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
      recorder(c, provider, 'test'),
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
