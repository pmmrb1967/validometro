// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Workers AI: the default, free within the account's daily Neurons. Gemma 4 reads images and
 * follows a JSON Schema; thinking is turned off (it would spend Neurons on a reading task).
 */
import { jsonSchema } from '../schemas';
import {
  AiError,
  imagesOf,
  type AiProvider,
  type AiResult,
  type StructuredRequest,
} from '../types';

export const WORKERS_AI_MODEL = '@cf/google/gemma-4-26b-a4b-it';

/** Catalogue prices (USD per million tokens) and the Neuron's price, to count the quota. */
const PRICE_IN = 0.1;
const PRICE_OUT = 0.3;
const USD_PER_NEURON = 0.011 / 1000;

export function neuronsFor(inputTokens: number, outputTokens: number): number {
  const usd = (inputTokens * PRICE_IN + outputTokens * PRICE_OUT) / 1_000_000;
  return Math.ceil(usd / USD_PER_NEURON);
}

interface ChatOutput {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Workers AI reports problems as plain errors; the daily allocation one has code 4006. */
function toAiError(err: unknown): AiError {
  const message = err instanceof Error ? err.message : String(err);
  if (/4006|daily free allocation|neurons/i.test(message)) return new AiError('quota', message);
  if (/too large|payload|413/i.test(message)) return new AiError('too_large', message);
  if (/429|rate/i.test(message)) return new AiError('rate_limited', message);
  return new AiError('unavailable', message);
}

export function workersAi(ai: Ai): AiProvider {
  return {
    id: 'workers-ai',
    async generate<T>(request: StructuredRequest<T>): Promise<AiResult> {
      const images = imagesOf(request);
      const content = images.length
        ? [
            ...images.map((image) => ({
              type: 'image_url',
              image_url: { url: `data:${image.mime};base64,${image.base64}` },
            })),
            { type: 'text', text: request.prompt },
          ]
        : request.prompt;
      let output: ChatOutput;
      try {
        output = (await ai.run(
          WORKERS_AI_MODEL as Parameters<Ai['run']>[0],
          {
            messages: [
              { role: 'system', content: request.system },
              { role: 'user', content },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: request.schemaName,
                schema: jsonSchema(request.schema),
                strict: true,
              },
            },
            max_completion_tokens: request.maxTokens,
            temperature: 0,
            chat_template_kwargs: { enable_thinking: false },
          } as never,
        )) as ChatOutput;
      } catch (err) {
        throw toAiError(err);
      }
      const text = output.choices?.[0]?.message?.content;
      if (!text) throw new AiError('invalid_output', 'empty answer');
      const inputTokens = output.usage?.prompt_tokens ?? 0;
      const outputTokens = output.usage?.completion_tokens ?? 0;
      return {
        text,
        units: neuronsFor(inputTokens, outputTokens),
        model: WORKERS_AI_MODEL,
        inputTokens,
        outputTokens,
      };
    },
  };
}
