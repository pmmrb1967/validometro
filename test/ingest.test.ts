// SPDX-License-Identifier: AGPL-3.0-or-later
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { gemini } from '../src/ai/providers/gemini';
import { receiptSchema } from '../src/ai/schemas';
import { app } from '../src/worker/app';
import type { ReceiptDrafts } from '../src/worker/ingest';
import { utcDay } from '../src/worker/usage';

/** A stand-in for the Workers AI binding: answers in turn, and remembers what it was asked. */
function fakeAi(...answers: string[]) {
  const calls: { model: string; input: Record<string, unknown> }[] = [];
  const ai = {
    async run(model: string, input: Record<string, unknown>) {
      calls.push({ model, input });
      const content = answers[Math.min(calls.length - 1, answers.length - 1)];
      return {
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 2000, completion_tokens: 600 },
      };
    },
  };
  return { ai: ai as unknown as Ai, calls };
}

const IMAGE = 'A'.repeat(400);

function post(path: string, body: unknown, ai: Ai, headers: Record<string, string> = {}) {
  return app.request(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    },
    { ...env, AI: ai },
  );
}

const receipt = JSON.stringify({
  store: 'Continente',
  date: null,
  lines: [
    {
      raw: 'IOG NAT 4X125G 1,29',
      name: 'Iogurte natural',
      category: 'iogurtes',
      quantity: 4,
      unit: 'un',
      perishable: true,
    },
    {
      raw: 'ARROZ AGULHA 1KG',
      name: 'Arroz agulha',
      category: null,
      quantity: null,
      unit: null,
      perishable: false,
    },
  ],
});

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM ai_usage'),
    env.DB.prepare('DELETE FROM product_aliases'),
  ]);
});

describe('POST /api/ingest/receipt', () => {
  it('turns a reading into drafts, with an estimate for what spoils', async () => {
    const { ai, calls } = fakeAi(receipt);
    const res = await post('/api/ingest/receipt', { image: IMAGE }, ai);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ReceiptDrafts;
    expect(body.store).toBe('Continente');
    const [yogurt, rice] = body.drafts;
    expect(yogurt).toMatchObject({
      name: 'Iogurte natural',
      location: 'frigorifico',
      expiry_source: 'estimada',
      quantity: 4,
    });
    expect(yogurt?.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(rice).toMatchObject({ perishable: false, expires_at: null, expiry_source: null });
    // The photo went as a data URL, with thinking off and a schema to follow.
    const input = calls[0]!.input as {
      messages: { content: unknown }[];
      response_format: { type: string };
    };
    expect(JSON.stringify(input.messages[1]!.content)).toContain(`data:image/jpeg;base64,${IMAGE}`);
    expect(input.response_format.type).toBe('json_schema');
  });

  it('reads the text of a digital receipt (PDF), with no image', async () => {
    const { ai, calls } = fakeAi(receipt);
    const text = ['CONTINENTE', 'IOG NAT 4X125 1,29', 'ARROZ AGULHA 1KG 1,49'].join('\n');
    const res = await post('/api/ingest/receipt', { text }, ai);
    expect(res.status).toBe(200);
    expect(((await res.json()) as ReceiptDrafts).drafts).toHaveLength(2);
    const sent = JSON.stringify(calls[0]!.input);
    expect(sent).toContain('IOG NAT 4X125');
    expect(sent).not.toContain('data:image');
  });

  it('reads a long receipt in parts as one, in order, with a note on how they join', async () => {
    const { ai, calls } = fakeAi(receipt);
    const res = await post('/api/ingest/receipt', { images: [IMAGE, `${IMAGE}B`] }, ai);
    expect(res.status).toBe(200);
    const sent = JSON.stringify(calls[0]!.input);
    expect(sent.indexOf(`base64,${IMAGE}"`)).toBeLessThan(sent.indexOf(`base64,${IMAGE}B`));
    expect(sent).toContain('partes seguidas do mesmo talão');
  });

  it('takes at most four parts', async () => {
    const res = await post(
      '/api/ingest/receipt',
      { images: Array(5).fill(IMAGE) },
      fakeAi(receipt).ai,
    );
    expect(res.status).toBe(400);
  });

  it('refuses a body that is neither a photo nor a receipt text', async () => {
    const res = await post('/api/ingest/receipt', { text: 'curto' }, fakeAi(receipt).ai);
    expect(res.status).toBe(400);
  });

  it('counts the call in ai_usage', async () => {
    await post('/api/ingest/receipt', { image: IMAGE }, fakeAi(receipt).ai);
    const row = await env.DB.prepare('SELECT provider, operation, units, ok FROM ai_usage').first();
    expect(row).toMatchObject({ provider: 'workers-ai', operation: 'receipt', ok: 1 });
    expect(Number(row?.units)).toBeGreaterThan(0);
  });

  it('asks once more when the answer does not match the schema', async () => {
    const { ai, calls } = fakeAi('not json', receipt);
    const res = await post('/api/ingest/receipt', { image: IMAGE }, ai);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it('gives up kindly after two bad answers', async () => {
    const { ai, calls } = fakeAi('{"lines": "nope"}');
    const res = await post('/api/ingest/receipt', { image: IMAGE }, ai);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'invalid_output' });
    expect(calls).toHaveLength(2);
  });

  it('lets a known receipt line override the AI', async () => {
    const save = await post(
      '/api/aliases',
      {
        store: 'Continente',
        lines: [
          {
            raw: 'IOG NAT 4X125G',
            name: 'Iogurte natural magro',
            category: 'iogurtes',
            perishable: true,
          },
        ],
      },
      fakeAi().ai,
    );
    expect(await save.json()).toEqual({ saved: 1 });
    const res = await post('/api/ingest/receipt', { image: IMAGE }, fakeAi(receipt).ai);
    const body = (await res.json()) as ReceiptDrafts;
    expect(body.drafts[0]).toMatchObject({ name: 'Iogurte natural magro', known: true });
    expect(body.drafts[1]?.known).toBe(false);
  });

  it('stops before the free daily allocation runs out', async () => {
    await env.DB.prepare(
      "INSERT INTO ai_usage (date, provider, operation, units, ok) VALUES (?, 'workers-ai', 'receipt', 9500, 1)",
    )
      .bind(utcDay(new Date()))
      .run();
    const { ai, calls } = fakeAi(receipt);
    const res = await post('/api/ingest/receipt', { image: IMAGE }, ai);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: 'quota' });
    expect(calls).toHaveLength(0);
  });

  it('rejects something that is not a photo', async () => {
    const res = await post('/api/ingest/receipt', { image: 'not base64!' }, fakeAi(receipt).ai);
    expect(res.status).toBe(400);
  });

  it('needs a key for the user-key providers', async () => {
    const res = await post('/api/ingest/receipt', { image: IMAGE }, fakeAi(receipt).ai, {
      'x-ai-provider': 'gemini',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'no_key' });
  });
});

describe('POST /api/ingest/voice', () => {
  it('keeps a date that was said out loud as manual', async () => {
    const spoken = JSON.stringify({
      lines: [
        {
          name: 'Leite meio-gordo',
          category: null,
          quantity: null,
          unit: null,
          perishable: true,
          expires_at: '2099-01-01',
        },
        {
          name: 'Peito de frango',
          category: null,
          quantity: 1,
          unit: 'kg',
          perishable: true,
          expires_at: null,
        },
      ],
    });
    const { ai, calls } = fakeAi(spoken);
    const res = await post('/api/ingest/voice', { text: 'comprei leite e frango' }, ai);
    expect(res.status).toBe(200);
    const { drafts } = (await res.json()) as ReceiptDrafts;
    // 2099 is beyond what a spoken date may be: dropped, estimated instead.
    expect(drafts[0]?.expiry_source).not.toBe('manual');
    expect(drafts[1]).toMatchObject({ raw: null, quantity: 1, unit: 'kg' });
    expect(JSON.stringify(calls[0]!.input)).toContain('comprei leite e frango');
  });
});

describe('POST /api/ai/recipes', () => {
  it('cooks with what goes off first, and may use the pantry stock too', async () => {
    const { ai, calls } = fakeAi(
      JSON.stringify({
        recipes: [
          {
            title: 'Atum com grão',
            minutes: 15,
            usa: ['Frango', 'Grão'],
            falta: [],
            steps: ['Junta.'],
          },
        ],
      }),
    );
    const res = await post(
      '/api/ai/recipes',
      { items: [{ name: 'Frango', days: 1 }], pantry: ['Grão', 'Atum em lata'] },
      ai,
    );
    expect(res.status).toBe(200);
    const sent = JSON.stringify(calls[0]!.input);
    expect(sent).toContain('Também há em casa');
    expect(sent).toContain('Atum em lata');
    // Without a pantry, as before.
    const { ai: plain, calls: asked } = fakeAi(
      JSON.stringify({
        recipes: [{ title: 'Frango', minutes: 20, usa: [], falta: [], steps: ['Grelha.'] }],
      }),
    );
    expect(
      (await post('/api/ai/recipes', { items: [{ name: 'Frango', days: 1 }] }, plain)).status,
    ).toBe(200);
    expect(JSON.stringify(asked[0]!.input)).not.toContain('Também há em casa');
  });
});

describe('POST /api/ingest/shelf', () => {
  it('lists what the photos show, in the place photographed', async () => {
    const seen = JSON.stringify({
      lines: [
        {
          name: 'Iogurte natural',
          category: 'iogurtes',
          quantity: 4,
          unit: 'un',
          perishable: true,
          expires_at: null,
        },
      ],
    });
    const { ai, calls } = fakeAi(seen);
    const res = await post(
      '/api/ingest/shelf',
      { images: [IMAGE, IMAGE], location: 'frigorifico' },
      ai,
    );
    expect(res.status).toBe(200);
    const { drafts } = (await res.json()) as ReceiptDrafts;
    expect(drafts[0]).toMatchObject({
      name: 'Iogurte natural',
      location: 'frigorifico',
      quantity: 4,
      expiry_source: 'estimada',
    });
    expect(JSON.stringify(calls[0]!.input)).toContain('2 fotografias');
  });

  it('refuses a place that is not one', async () => {
    const res = await post(
      '/api/ingest/shelf',
      { images: [IMAGE], location: 'sotao' },
      fakeAi().ai,
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/ingest/date', () => {
  it('returns the printed date', async () => {
    const res = await post(
      '/api/ingest/date',
      { image: IMAGE },
      fakeAi('{"date":"2026-12-01","kind":"consumir_ate"}').ai,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ date: '2026-12-01', kind: 'consumir_ate' });
  });

  it('says so when there is no readable date', async () => {
    const res = await post(
      '/api/ingest/date',
      { image: IMAGE },
      fakeAi('{"date":null,"kind":"desconhecido"}').ai,
    );
    expect(res.status).toBe(422);
  });
});

describe('Gemini provider', () => {
  it('sends the key in a header, not in the URL', async () => {
    let url = '';
    let key: string | null = null;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      url = String(input);
      key = new Headers(init?.headers).get('x-goog-api-key');
      return Response.json({
        candidates: [{ content: { parts: [{ text: '{"store":null,"date":null,"lines":[]}' }] } }],
        usageMetadata: { totalTokenCount: 42 },
      });
    }) as typeof fetch;
    const result = await gemini('secret-key', fetcher).generate({
      operation: 'receipt',
      system: 's',
      prompt: 'p',
      schema: receiptSchema,
      schemaName: 'receipt',
      maxTokens: 10,
    });
    expect(result.units).toBe(42);
    expect(key).toBe('secret-key');
    expect(url).not.toContain('secret-key');
  });

  it('maps a refused key', async () => {
    const fetcher = (async () =>
      Response.json(
        { error: { status: 'INVALID_ARGUMENT', message: 'API key not valid' } },
        { status: 400 },
      )) as unknown as typeof fetch;
    await expect(
      gemini('bad', fetcher).generate({
        operation: 'test',
        system: 's',
        prompt: 'p',
        schema: receiptSchema,
        schemaName: 't',
        maxTokens: 5,
      }),
    ).rejects.toMatchObject({ code: 'invalid_key' });
  });
});
