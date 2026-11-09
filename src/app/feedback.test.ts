// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Wattómetro (src/app/feedback.test.ts).
import { describe, expect, it } from 'vitest';
import { FEEDBACK_EMAIL, feedbackBody, feedbackLink } from './feedback';

describe('feedback email', () => {
  it('carries the version and page, nothing else', () => {
    const body = feedbackBody('/definicoes', '0.1.0 (abc1234)');
    expect(body).toContain('Versão: 0.1.0 (abc1234)');
    expect(body).toContain('Página: /definicoes');
  });

  it('opens a message to the project, with an encoded subject', () => {
    const link = feedbackLink('/');
    expect(link.startsWith(`mailto:${FEEDBACK_EMAIL}?subject=`)).toBe(true);
    expect(decodeURIComponent(/subject=([^&]+)/.exec(link)?.[1] ?? '')).toBe(
      'Validómetro: Sugestão ou problema',
    );
  });
});
