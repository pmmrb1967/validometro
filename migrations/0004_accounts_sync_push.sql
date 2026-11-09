-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Phase 3: accounts (as in Wattómetro: email + password, signed session cookie), sync of the
-- household's items, and the daily alert.

-- pbkdf2-sha256$<iterations>$<salt>$<hash> (base64url); see src/worker/password.ts.
ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';
-- Part of every session token: raising it signs the user out everywhere.
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;
-- Claude model chosen by the user (ai_provider = 'claude').
ALTER TABLE users ADD COLUMN ai_model TEXT;

-- Sync (src/worker/sync.ts): the client's time of the last change (last write wins), and the
-- server's order of writes, which clients pull from (a cursor, so clocks do not matter).
ALTER TABLE items ADD COLUMN updated_at TEXT;
ALTER TABLE items ADD COLUMN server_seq INTEGER NOT NULL DEFAULT 0;
CREATE INDEX items_household_seq ON items (household_id, server_seq);

CREATE TABLE counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
) WITHOUT ROWID;
INSERT INTO counters (name, value) VALUES ('items', 0);

-- Failed logins (src/worker/auth.ts), per email and address and per address alone. The address
-- is only kept as an HMAC with SESSION_SECRET. Times are epoch seconds.
CREATE TABLE login_attempts (
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  failures INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  locked_until INTEGER,
  PRIMARY KEY (email, address)
);

CREATE TABLE login_addresses (
  address TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  locked_until INTEGER
);

-- The daily alert is sent once per household and Lisbon day, even if the Cron runs twice.
CREATE TABLE alert_log (
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (household_id, day)
) WITHOUT ROWID;
