// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
import { app } from './app';

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
