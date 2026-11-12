-- SPDX-License-Identifier: AGPL-3.0-or-later
-- What things cost the last time (src/domain/prices.ts): the name and price of each line of a
-- receipt saved, chosen or not, as JSON [{name, price}]. The list of shopping estimates from it.
ALTER TABLE receipts ADD COLUMN prices TEXT;
