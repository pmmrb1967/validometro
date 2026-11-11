// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Ask, parse, check: the answer must be JSON and pass the Zod schema. One retry when it
 * does not (CLAUDE.md, AI pipeline step 3); then a friendly error. Every call is counted.
 */
import {
  AiError,
  type AiProvider,
  type AiResult,
  type AiUsage,
  type StructuredRequest,
} from './types';

export type UsageRecorder = (usage: AiUsage, ok: boolean) => Promise<void>;

function parse<T>(request: StructuredRequest<T>, result: AiResult): T | undefined {
  let value: unknown;
  try {
    // Some models wrap JSON in a code fence despite the schema.
    value = JSON.parse(result.text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
  } catch {
    return undefined;
  }
  const checked = request.schema.safeParse(value);
  return checked.success ? checked.data : undefined;
}

export async function structured<T>(
  provider: AiProvider,
  request: StructuredRequest<T>,
  record: UsageRecorder,
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let result: AiResult;
    try {
      result = await provider.generate(request);
    } catch (err) {
      await record({ units: 0 }, false);
      throw err;
    }
    const value = parse(request, result);
    await record(result, value !== undefined);
    if (value !== undefined) return value;
  }
  throw new AiError('invalid_output', `${request.operation} did not match the schema`);
}
