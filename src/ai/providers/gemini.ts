// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Gemini Flash-Lite with the user's own key (Google AI Studio has a free tier). Plain REST:
 * the Worker only forwards bytes. The key travels in a header, never in the URL or the logs.
 */
import { jsonSchema } from '../schemas';
import {
  AiError,
  imagesOf,
  type AiProvider,
  type AiResult,
  type StructuredRequest,
} from '../types';

export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; totalTokenCount?: number };
}

async function failure(res: Response): Promise<AiError> {
  let reason = '';
  try {
    const body = (await res.json()) as { error?: { status?: string; message?: string } };
    reason = `${body.error?.status ?? ''} ${body.error?.message ?? ''}`;
  } catch {
    // No body: the status says enough.
  }
  if (res.status === 400 && /API_KEY_INVALID|API key not valid/i.test(reason))
    return new AiError('invalid_key', `gemini ${res.status}`);
  if (res.status === 401 || res.status === 403)
    return new AiError('invalid_key', `gemini ${res.status}`);
  if (res.status === 413) return new AiError('too_large', `gemini ${res.status}`);
  if (res.status === 429) return new AiError('rate_limited', `gemini ${res.status}`);
  return new AiError('unavailable', `gemini ${res.status}`);
}

export function gemini(apiKey: string, fetcher: typeof fetch = fetch): AiProvider {
  return {
    id: 'gemini',
    async generate<T>(request: StructuredRequest<T>): Promise<AiResult> {
      const parts: object[] = [];
      for (const image of imagesOf(request))
        parts.push({ inline_data: { mime_type: image.mime, data: image.base64 } });
      parts.push({ text: request.prompt });
      let res: Response;
      try {
        res = await fetcher(`${ENDPOINT}/${GEMINI_MODEL}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.system }] },
            contents: [{ role: 'user', parts }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseJsonSchema: jsonSchema(request.schema),
              maxOutputTokens: request.maxTokens,
              temperature: 0,
            },
          }),
        });
      } catch {
        throw new AiError('unavailable', 'gemini network');
      }
      if (!res.ok) throw await failure(res);
      const body = (await res.json()) as GeminiResponse;
      if (body.promptFeedback?.blockReason) throw new AiError('refused', 'gemini blocked');
      const candidate = body.candidates?.[0];
      if (candidate?.finishReason === 'SAFETY') throw new AiError('refused', 'gemini safety');
      const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('');
      if (!text) throw new AiError('invalid_output', 'gemini empty');
      const usage = body.usageMetadata;
      const inputTokens = usage?.promptTokenCount ?? 0;
      const total = usage?.totalTokenCount ?? 0;
      return {
        text,
        units: total,
        model: GEMINI_MODEL,
        inputTokens,
        // Thinking tokens are billed as output: everything that is not the prompt.
        outputTokens: Math.max(0, total - inputTokens),
      };
    },
  };
}
