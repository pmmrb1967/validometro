-- Phase 4: the household's shopping list syncs like the items (sync.ts). Entries are never
-- deleted, only marked 'removido', so removals reach every phone. `done` stays for old rows.
ALTER TABLE shopping_list ADD COLUMN category TEXT;
ALTER TABLE shopping_list ADD COLUMN state TEXT NOT NULL DEFAULT 'pendente'
  CHECK (state IN ('sugerido', 'pendente', 'comprado', 'removido'));
ALTER TABLE shopping_list ADD COLUMN item_id TEXT;
ALTER TABLE shopping_list ADD COLUMN updated_at TEXT;
ALTER TABLE shopping_list ADD COLUMN server_seq INTEGER NOT NULL DEFAULT 0;
CREATE INDEX shopping_list_sync ON shopping_list (household_id, server_seq);
