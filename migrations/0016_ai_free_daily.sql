-- SPDX-License-Identifier: AGPL-3.0-or-later
-- The free AI's share per device (or account) and per UTC day (src/worker/free-ai.ts), so one
-- person or one script cannot spend everyone's daily Neurons. `subject` is
-- sha256(day + device id or user id): it changes every day and is not the id itself. Only
-- today's and yesterday's rows are kept (the hourly cron deletes the rest).
CREATE TABLE ai_free_daily (
  date TEXT NOT NULL,
  subject TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  neurons INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, subject)
);
