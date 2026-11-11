-- SPDX-License-Identifier: AGPL-3.0-or-later
-- "Regras de validade": a household's own days for a rule (src/domain/shelf-life.ts). The
-- defaults stay in shelf_life_rules; only what a household changed is kept here.
CREATE TABLE shelf_life_overrides (
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  location TEXT NOT NULL CHECK (location IN ('frigorifico', 'congelador', 'despensa')),
  state TEXT NOT NULL CHECK (state IN ('fechado', 'aberto')),
  days INTEGER NOT NULL CHECK (days BETWEEN 0 AND 3650),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, category, location, state)
) WITHOUT ROWID;
