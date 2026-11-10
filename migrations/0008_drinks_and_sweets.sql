-- SPDX-License-Identifier: AGPL-3.0-or-later
-- A receipt's drinks and sweets had no type of their own: water and stout came back as "Outro",
-- canned beer and chocolates as "Enlatados / massa / arroz". Both are long life, like the
-- pantry staples, whose label now also names flour (and yeast, sugar) that already fell in it.
UPDATE shelf_life_rules SET label = 'Mercearia (massa, arroz, enlatados, farinha)'
  WHERE category = 'longa_duracao';

INSERT INTO shelf_life_rules (category, location, state, days_default, label, notes) VALUES
  ('bebidas',      'despensa', 'fechado', NULL, 'Bebidas (água, sumos, cerveja, vinho)', 'Longa duração (fora do semáforo)'),
  ('doces_snacks', 'despensa', 'fechado', NULL, 'Doces e snacks (chocolate, bolachas)', 'Longa duração (fora do semáforo)');
