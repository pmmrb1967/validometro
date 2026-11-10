-- SPDX-License-Identifier: AGPL-3.0-or-later
-- "Consumir até" (safety) is not "consumir de preferência antes de" (quality): the kind of
-- printed date changes what the app says once it has passed (src/domain/date-kind.ts).
-- The price, read from the receipt or typed, counts the waste in euros. Both optional.
ALTER TABLE items ADD COLUMN expiry_kind TEXT
  CHECK (expiry_kind IN ('consumir_ate', 'consumir_de_preferencia'));
ALTER TABLE items ADD COLUMN price REAL;
