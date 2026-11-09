-- SPDX-License-Identifier: AGPL-3.0-or-later
-- "Legumes / saladas embaladas" read like a duplicate of "Saladas embaladas" in the type list.
UPDATE shelf_life_rules SET label = 'Legumes' WHERE category = 'legumes';
