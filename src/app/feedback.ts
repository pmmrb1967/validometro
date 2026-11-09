// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Wattómetro and Faturómetro (src/app/feedback.ts).
/**
 * Feedback by email: a mailto link that opens the user's own email app. The app sends nothing;
 * the "from" is whatever account that app uses. Subjects start with "Validómetro:" so they can
 * be grouped on arrival.
 */
import { APP_COMMIT, APP_VERSION } from './build-info';
import { t } from './i18n/pt-PT';

export const FEEDBACK_EMAIL = 'validometro@outlook.com';

/** Technical lines that help with a report: version and page, never what is in the fridge. */
export function feedbackBody(page: string, version = `${APP_VERSION} (${APP_COMMIT})`): string {
  const copy = t.feedback;
  return [copy.bodyStart, '', '', copy.technical, copy.version(version), copy.page(page)].join(
    '\n',
  );
}

export function feedbackLink(page: string): string {
  const subject = `Validómetro: ${t.feedback.subject}`;
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(feedbackBody(page))}`;
}
