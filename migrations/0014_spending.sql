-- SPDX-License-Identifier: AGPL-3.0-or-later
-- What was spent each month (src/domain/spending.ts): the total of each receipt saved (the
-- QR code's, or the sum of the prices read), and the items' link to their receipt, so a price
-- typed by hand (the farmer's tomatoes, no receipt) counts on its own and a receipt's never twice.
ALTER TABLE receipts ADD COLUMN total REAL;
ALTER TABLE items ADD COLUMN receipt_id TEXT;
