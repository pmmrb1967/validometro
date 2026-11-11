// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { joinTranscripts } from './speech';

describe('dictation', () => {
  it('does not repeat what Chrome on Android says again in each result', () => {
    expect(
      joinTranscripts(['azeite', 'azeite virgem', 'Azeite virgem e', 'azeite virgem e sal']),
    ).toBe('azeite virgem e sal');
  });

  it('keeps the parts a computer gives one after the other', () => {
    expect(joinTranscripts(['azeite virgem', ' e sal', 'leite meio-gordo'])).toBe(
      'azeite virgem e sal leite meio-gordo',
    );
  });

  it('drops a shorter repeat and empty results', () => {
    expect(joinTranscripts(['dois iogurtes e pão', 'dois iogurtes', ''])).toBe(
      'dois iogurtes e pão',
    );
  });
});
