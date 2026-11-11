-- SPDX-License-Identifier: AGPL-3.0-or-later
-- "Registado por engano? Apagar": an item saved twice, or by mistake, leaves the inventory
-- without counting as eaten or thrown away (src/domain/types.ts). The row stays, with status
-- 'apagado', so the deletion reaches the household's other phones like any other change.
-- SQLite cannot change a CHECK in place: the table is rebuilt with the same columns.
CREATE TABLE items_next (
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
  status TEXT NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo', 'consumido', 'deitado_fora', 'apagado')),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT,
  server_seq INTEGER NOT NULL DEFAULT 0,
  expiry_kind TEXT CHECK (expiry_kind IN ('consumir_ate', 'consumir_de_preferencia')),
  price REAL
);

INSERT INTO items_next (
  id, household_id, created_by, name, category, location, ean, quantity, unit, purchased_at,
  opened_at, expires_at, expiry_source, status, resolved_at, created_at, updated_at, server_seq,
  expiry_kind, price
)
SELECT
  id, household_id, created_by, name, category, location, ean, quantity, unit, purchased_at,
  opened_at, expires_at, expiry_source, status, resolved_at, created_at, updated_at, server_seq,
  expiry_kind, price
FROM items;

DROP TABLE items;
ALTER TABLE items_next RENAME TO items;
CREATE INDEX items_household_status_expiry ON items (household_id, status, expires_at);
CREATE INDEX items_household_seq ON items (household_id, server_seq);
