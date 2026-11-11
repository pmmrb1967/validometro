// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { costUsd, formatUsd, MODEL_PRICES, TYPICAL_TOKENS } from './ai-cost';
import { CLAUDE_MODELS } from '../ai/providers/anthropic';
import { GEMINI_MODEL } from '../ai/providers/gemini';

describe('AI cost', () => {
  it('prices input and output apart, by model', () => {
    // Claude Opus 5.5: 4 US$ in, 20 US$ out, per million tokens.
    expect(costUsd('claude-opus-5-5', { input: 1_000_000, output: 0 })).toBe(4);
    expect(costUsd('claude-opus-5-5', { input: 4_000, output: 2_000 })).toBeCloseTo(0.056);
    expect(costUsd('claude-haiku-5-5', TYPICAL_TOKENS.receipt)).toBeLessThan(0.002);
  });

  it('does not guess a price it does not know', () => {
    expect(costUsd('another-model', { input: 1, output: 1 })).toBeNull();
    expect(costUsd(null, { input: 1, output: 1 })).toBeNull();
  });

  it('knows the price of every model the app can ask', () => {
    for (const model of [...CLAUDE_MODELS, GEMINI_MODEL]) expect(MODEL_PRICES[model]).toBeDefined();
  });

  it('writes small amounts with two significant digits', () => {
    expect(formatUsd(0.0236)).toBe('0,024 US$');
    expect(formatUsd(0.00421)).toBe('0,0042 US$');
    expect(formatUsd(0.24)).toBe('0,24 US$');
    expect(formatUsd(3.456)).toBe('3,46 US$');
    expect(formatUsd(0.0004)).toBe('menos de 0,001 US$');
  });
});
