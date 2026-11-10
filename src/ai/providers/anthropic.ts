// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Claude with the user's own key, through the official SDK (it runs on Workers). Structured
 * outputs hold the answer to the schema; the caller still checks it with Zod.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import {
  AiError,
  imagesOf,
  type AiProvider,
  type AiResult,
  type StructuredRequest,
} from '../types';

export const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const;
export type ClaudeModel = (typeof CLAUDE_MODELS)[number];
export const DEFAULT_CLAUDE_MODEL: ClaudeModel = 'claude-opus-5-5';

/** Server-side fallback on a policy decline; Haiku has none. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

function toAiError(err: unknown): AiError {
  if (err instanceof Anthropic.AuthenticationError) return new AiError('invalid_key', 'claude 401');
  if (err instanceof Anthropic.PermissionDeniedError)
    return new AiError('invalid_key', 'claude 403');
  if (err instanceof Anthropic.RateLimitError) return new AiError('rate_limited', 'claude 429');
  if (err instanceof Anthropic.BadRequestError) {
    // The API says so only in the message: there is no separate type for an empty balance.
    if (/credit balance/i.test(err.message)) return new AiError('no_credit', 'claude credit');
    if (/too large|exceeds/i.test(err.message)) return new AiError('too_large', 'claude 400');
    return new AiError('unavailable', 'claude 400');
  }
  if (err instanceof Anthropic.APIError) return new AiError('unavailable', `claude ${err.status}`);
  return new AiError('unavailable', 'claude network');
}

export function anthropic(apiKey: string, model: ClaudeModel = DEFAULT_CLAUDE_MODEL): AiProvider {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
  return {
    id: 'anthropic',
    async generate<T>(request: StructuredRequest<T>): Promise<AiResult> {
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      for (const image of imagesOf(request))
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: image.mime, data: image.base64 },
        });
      content.push({ type: 'text', text: request.prompt });
      const withFallback = model !== 'claude-haiku-5-5';
      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await client.beta.messages.create({
          model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: [{ role: 'user', content }],
          output_config: { format: betaZodOutputFormat(request.schema) },
          ...(withFallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
        });
      } catch (err) {
        throw toAiError(err);
      }
      if (message.stop_reason === 'refusal') throw new AiError('refused', 'claude refusal');
      if (message.stop_reason === 'max_tokens') throw new AiError('invalid_output', 'claude cut');
      const text = message.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('');
      if (!text) throw new AiError('invalid_output', 'claude empty');
      return { text, units: message.usage.input_tokens + message.usage.output_tokens };
    },
  };
}
