// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * One interface for every AI provider (Workers AI, Gemini, Claude), so the model can change
 * without touching the rest. Shape adapted from Wattómetro (src/ai/provider.ts).
 */
import type { z } from 'zod';

export const PROVIDERS = ['workers-ai', 'gemini', 'anthropic'] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export type Operation = 'receipt' | 'voice' | 'date' | 'recipes' | 'shelf' | 'test';

/** A photo already made small by the browser (src/app/image.ts). */
export interface AiImage {
  mime: 'image/jpeg';
  /** Standard base64, no `data:` prefix. */
  base64: string;
}

export interface StructuredRequest<T> {
  operation: Operation;
  system: string;
  prompt: string;
  image?: AiImage;
  /** Several photos of one document (a long receipt in parts), in order. */
  images?: AiImage[];
  schema: z.ZodType<T>;
  /** Short identifier some APIs want for the schema ("receipt"). */
  schemaName: string;
  maxTokens: number;
}

/** The request's photos, in order: `images`, or the one `image`. */
export function imagesOf(request: Pick<StructuredRequest<unknown>, 'image' | 'images'>): AiImage[] {
  return request.images ?? (request.image ? [request.image] : []);
}

export interface AiResult {
  /** The model's text: JSON, to be parsed and checked by the caller. */
  text: string;
  /** For `ai_usage`: estimated Neurons on Workers AI, tokens elsewhere. */
  units: number;
  /** The model that answered and its tokens, to price the call (src/domain/ai-cost.ts). */
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}

/** What `ai_usage` keeps of a call: no text, no image, no key. */
export type AiUsage = Pick<AiResult, 'units' | 'model' | 'inputTokens' | 'outputTokens'>;

export interface AiProvider {
  id: ProviderId;
  generate<T>(request: StructuredRequest<T>): Promise<AiResult>;
}

export type AiErrorCode =
  | 'no_key'
  | 'invalid_key'
  | 'no_credit'
  | 'rate_limited'
  | 'quota'
  | 'unavailable'
  | 'invalid_output'
  | 'refused'
  | 'too_large';

export class AiError extends Error {
  readonly code: AiErrorCode;

  /** `detail` is for logs only: never the key, the image or the model's text. */
  constructor(code: AiErrorCode, detail?: string) {
    super(detail ?? code);
    this.code = code;
  }
}
