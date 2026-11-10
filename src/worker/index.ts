// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
import { sendDailyAlerts } from './alerts';
import { app } from './app';
import { runMonitor } from './monitor';

export default {
  fetch: app.fetch,
  /** Every hour: the free-plan watch, and at 09:00 in Lisbon the daily alert (alerts.ts). */
  scheduled(controller, env, ctx) {
    const now = new Date(controller.scheduledTime);
    ctx.waitUntil(
      Promise.allSettled([sendDailyAlerts(env, now), runMonitor(env, now)]).then((results) => {
        for (const result of results) {
          if (result.status === 'rejected') {
            console.error('Scheduled task failed', String(result.reason));
          }
        }
      }),
    );
  },
} satisfies ExportedHandler<Env>;
