-- SPDX-License-Identifier: AGPL-3.0-or-later
-- A note of each receipt the household saved, so the same one read twice (by two people, or
-- as a photo and then as the PDF) is told apart (src/domain/receipts.ts). Never the receipt:
-- a hash of the QR code's shop and document number, the shop's name, the day, and short
-- hashes of the lines. Like the recipes, never deleted.
CREATE TABLE receipts (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  qr_hash TEXT,
  store TEXT,
  date TEXT,
  lines TEXT NOT NULL DEFAULT '[]',
  items INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  server_seq INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX receipts_sync ON receipts (household_id, server_seq);
CREATE INDEX receipts_qr ON receipts (household_id, qr_hash);
