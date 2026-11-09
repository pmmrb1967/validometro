// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
import { sendDailyAlerts } from './alerts';
import { app } from './app';

export default {
  fetch: app.fetch,
  /** 08:00 and 09:00 UTC: the daily alert goes out at 09:00 in Lisbon (alerts.ts). */
  scheduled(controller, env, ctx) {
    ctx.waitUntil(sendDailyAlerts(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
