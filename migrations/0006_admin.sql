-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Phase 5: the admin panel and the free-plan watch (src/worker/monitor.ts, as in Prazómetro).

-- Lisbon day the user last opened the app (GET /auth/me, written at most once a day): the
-- panel counts active people without a write per request.
ALTER TABLE users ADD COLUMN last_seen_on TEXT;

-- One value per metric and UTC day, rewritten by the hourly Cron (the free-plan daily limits
-- reset at 00:00 UTC).
CREATE TABLE usage_daily (
  date TEXT NOT NULL,
  metric TEXT NOT NULL,
  value INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (date, metric)
) WITHOUT ROWID;

-- A limit warning goes to the admins once per metric, threshold and day.
CREATE TABLE limit_alerts (
  date TEXT NOT NULL,
  metric TEXT NOT NULL,
  threshold INTEGER NOT NULL,
  value INTEGER NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (date, metric, threshold)
) WITHOUT ROWID;
