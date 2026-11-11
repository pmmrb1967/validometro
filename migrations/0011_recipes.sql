-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Recipes the AI suggested, kept with the items they use and shared with the household
-- (src/domain/recipes.ts). Like the shopping list, never deleted, only 'removida'. The
-- lists are JSON arrays of strings; nothing here is a photo or a key.
CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  usa TEXT NOT NULL DEFAULT '[]',
  falta TEXT NOT NULL DEFAULT '[]',
  steps TEXT NOT NULL DEFAULT '[]',
  item_ids TEXT NOT NULL DEFAULT '[]',
  starred INTEGER NOT NULL DEFAULT 0 CHECK (starred IN (0, 1)),
  state TEXT NOT NULL DEFAULT 'nova' CHECK (state IN ('nova', 'feita', 'removida')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  server_seq INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX recipes_sync ON recipes (household_id, server_seq);
