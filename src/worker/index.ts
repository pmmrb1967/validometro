// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
import { sendDailyAlerts } from './alerts';
import { app } from './app';
import { purgeFreeShares } from './free-ai';
import { runMonitor } from './monitor';

export default {
  fetch(request, env, ctx) {
    // A share that reached the server: the service worker (public/push-sw.js) was not there
    // to take it, so the add screen explains instead.
    if (new URL(request.url).pathname === '/partilhar') {
      return Response.redirect(new URL('/adicionar?partilha=sem-app', request.url).href, 303);
    }
    return app.fetch(request, env, ctx);
  },
  /**
   * Every hour: the free-plan watch, the free AI's old shares deleted (free-ai.ts), and at
   * 09:00 in Lisbon the daily alert (alerts.ts).
   */
  scheduled(controller, env, ctx) {
    const now = new Date(controller.scheduledTime);
    ctx.waitUntil(
      Promise.allSettled([
        sendDailyAlerts(env, now),
        runMonitor(env, now),
        purgeFreeShares(env.DB, now),
      ]).then((results) => {
        for (const result of results) {
          if (result.status === 'rejected') {
            console.error('Scheduled task failed', String(result.reason));
          }
        }
      }),
    );
  },
} satisfies ExportedHandler<Env>;
