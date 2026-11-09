-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Indicative shelf life in days (planning/plan.md, "Seed inicial de shelf_life_rules").
-- A printed date always wins; these are only the fallback. Rows the plan gives without a
-- state ("—") are seeded for both states. days_default NULL = long life (no traffic light).

INSERT INTO shelf_life_rules (category, location, state, days_default, label, notes) VALUES
  ('carne_picada',        'frigorifico', 'fechado', 1,    'Carne picada', NULL),
  ('carne_picada',        'frigorifico', 'aberto',  1,    'Carne picada', NULL),
  ('carne_fresca',        'frigorifico', 'fechado', 2,    'Carne fresca (bifes, frango)', NULL),
  ('carne_fresca',        'frigorifico', 'aberto',  2,    'Carne fresca (bifes, frango)', NULL),
  ('peixe_fresco',        'frigorifico', 'fechado', 1,    'Peixe fresco', NULL),
  ('peixe_fresco',        'frigorifico', 'aberto',  1,    'Peixe fresco', NULL),
  ('charcutaria_fatiada', 'frigorifico', 'aberto',  4,    'Fiambre / charcutaria fatiada', NULL),
  ('queijo_fresco',       'frigorifico', 'aberto',  4,    'Queijo fresco', NULL),
  ('queijo_curado',       'frigorifico', 'aberto',  21,   'Queijo curado', NULL),
  ('leite_uht',           'despensa',    'fechado', 90,   'Leite UHT', 'Usar a data impressa'),
  ('leite_uht',           'frigorifico', 'aberto',  4,    'Leite UHT', NULL),
  ('leite_fresco',        'frigorifico', 'fechado', 5,    'Leite fresco pasteurizado', NULL),
  ('leite_fresco',        'frigorifico', 'aberto',  4,    'Leite fresco pasteurizado', NULL),
  ('iogurtes',            'frigorifico', 'fechado', 21,   'Iogurtes', 'Usar a data impressa'),
  ('natas',               'frigorifico', 'aberto',  4,    'Natas', NULL),
  ('ovos',                'frigorifico', 'fechado', 21,   'Ovos', NULL),
  ('pao_fresco',          'despensa',    'fechado', 2,    'Pão fresco', NULL),
  ('pao_fresco',          'despensa',    'aberto',  2,    'Pão fresco', NULL),
  ('fruta',               'despensa',    'fechado', 5,    'Fruta', NULL),
  ('fruta',               'despensa',    'aberto',  5,    'Fruta', NULL),
  ('fruta',               'frigorifico', 'fechado', 5,    'Fruta', NULL),
  ('fruta',               'frigorifico', 'aberto',  5,    'Fruta', NULL),
  ('legumes',             'frigorifico', 'fechado', 4,    'Legumes / saladas embaladas', NULL),
  ('saladas_embaladas',   'frigorifico', 'fechado', 4,    'Saladas embaladas', NULL),
  ('saladas_embaladas',   'frigorifico', 'aberto',  1,    'Saladas embaladas', NULL),
  ('sobras',              'frigorifico', 'fechado', 3,    'Sobras cozinhadas', NULL),
  ('sobras',              'frigorifico', 'aberto',  3,    'Sobras cozinhadas', NULL),
  ('congelados',          'congelador',  'fechado', 120,  'Congelados (genérico)', NULL),
  ('congelados',          'congelador',  'aberto',  120,  'Congelados (genérico)', NULL),
  ('congelado_em_casa',   'congelador',  'fechado', 90,   'Carne/peixe congelado em casa', NULL),
  ('congelado_em_casa',   'congelador',  'aberto',  90,   'Carne/peixe congelado em casa', NULL),
  ('molhos_frascos',      'frigorifico', 'aberto',  14,   'Molhos / frascos', NULL),
  ('longa_duracao',       'despensa',    'fechado', NULL, 'Enlatados / massa / arroz', 'Longa duração (fora do semáforo)');
