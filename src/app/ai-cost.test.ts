// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { costNote, type Estimate } from './ai-cost';
import { DEFAULT_SETTINGS } from './ai-settings';

const estimate: Estimate = {
  neuronsToday: 140,
  neuronsLimit: 10_000,
  neurons: [{ operation: 'receipt', neurons: 40 }],
  tokens: [{ model: 'claude-sonnet-5-5', operation: 'recipes', input: 1_000, output: 2_000 }],
};

describe('the AI cost note', () => {
  it('free AI: the Neurons of one call and what is left today', () => {
    // pt-PT groups thousands with a narrow space.
    expect(costNote(DEFAULT_SETTINGS, estimate, 'receipt')).toMatch(
      /^IA gratuita: ≈ 40 neurons por talão; hoje restam 9860 de 10\s000\.$/,
    );
    // Three photos of one long receipt are read three times over.
    expect(costNote(DEFAULT_SETTINGS, estimate, 'receipt', 3)).toMatch(
      /≈ 120 neurons pelas 3 fotos/,
    );
  });

  it('own key: US dollars, by the chosen model, from the averages when there are some', () => {
    const sonnet = {
      ...DEFAULT_SETTINGS,
      provider: 'anthropic' as const,
      claudeModel: 'claude-sonnet-5-5',
    };
    // 1000 × 2 + 2000 × 10 per million = 0.022 US$.
    expect(costNote(sonnet, estimate, 'recipes')).toBe(
      'Na tua chave (Claude Sonnet 5.5): ≈ 0,022 US$ por pedido.',
    );
    // No history yet for Gemini: the typical values.
    const gemini = { ...DEFAULT_SETTINGS, provider: 'gemini' as const };
    expect(costNote(gemini, undefined, 'receipt')).toMatch(
      /^Na tua chave \(Gemini Flash-Lite\): ≈ 0,00\d+ US\$ por talão\.$/,
    );
  });
});
