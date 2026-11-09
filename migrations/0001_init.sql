-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Initial schema (CLAUDE.md, "Modelo de dados"). Dates are ISO 8601 UTC text.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ai_provider TEXT NOT NULL DEFAULT 'workers_ai'
    CHECK (ai_provider IN ('workers_ai', 'gemini', 'claude')),
  ai_key_encrypted TEXT
);

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE household_members (
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  PRIMARY KEY (household_id, user_id)
);
CREATE INDEX household_members_user ON household_members (user_id);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT,
  location TEXT NOT NULL CHECK (location IN ('frigorifico', 'congelador', 'despensa')),
  ean TEXT,
  -- Quantities are always optional (CLAUDE.md, principle 2).
  quantity REAL,
  unit TEXT,
  purchased_at TEXT,
  opened_at TEXT,
  expires_at TEXT,
  expiry_source TEXT CHECK (expiry_source IN ('impressa', 'estimada', 'manual')),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'consumido', 'deitado_fora')),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX items_household_status_expiry ON items (household_id, status, expires_at);

-- Shared dictionary of receipt abbreviations. store '' = any store (SQLite PKs and NULL).
CREATE TABLE product_aliases (
  raw_text_normalized TEXT NOT NULL,
  store TEXT NOT NULL DEFAULT '',
  canonical_name TEXT NOT NULL,
  category TEXT,
  perishable INTEGER NOT NULL DEFAULT 1 CHECK (perishable IN (0, 1)),
  hits INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (raw_text_normalized, store)
);

-- Open Food Facts cache by EAN.
CREATE TABLE products (
  ean TEXT PRIMARY KEY,
  name TEXT,
  brand TEXT,
  category TEXT,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Fallback shelf life. days_default NULL = long-life item, kept out of the traffic light.
CREATE TABLE shelf_life_rules (
  category TEXT NOT NULL,
  location TEXT NOT NULL CHECK (location IN ('frigorifico', 'congelador', 'despensa')),
  state TEXT NOT NULL CHECK (state IN ('fechado', 'aberto')),
  days_default INTEGER,
  label TEXT NOT NULL,
  notes TEXT,
  PRIMARY KEY (category, location, state)
);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  keys_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);

CREATE TABLE shopping_list (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('auto', 'manual')),
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX shopping_list_household ON shopping_list (household_id, done);

CREATE TABLE ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL CHECK (ok IN (0, 1))
);
CREATE INDEX ai_usage_date ON ai_usage (date, provider);
