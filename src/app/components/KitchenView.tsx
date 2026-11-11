// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The drawn kitchen: the family's fridge and freezer (as set in Definições) and the pantry,
 * with each item where it is easiest to see (domain/kitchen.ts). Each item is a button: it
 * opens its usual card under the drawing, with the one-tap answers. The list stays the
 * quickest way to act; this is the nicer way to look.
 */
import { useState } from 'react';
import { arrangeKitchen, iconFor, SHELF_SHOWN, type KitchenLayout } from '../../domain/kitchen';
import { daysLabel, type LitItem } from '../../domain/traffic-light';
import type { Location } from '../../domain/types';
import { FoodIcon } from './FoodIcon';

function FoodButton({
  entry,
  selected,
  onSelect,
}: {
  entry: LitItem;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const days = entry.longLife ? 'longa duração' : daysLabel(entry.daysLeft).toLowerCase();
  return (
    <li>
      <button
        type="button"
        className={`food light-${entry.light ?? 'none'}`}
        aria-pressed={selected}
        aria-label={`${entry.item.name}, ${days}`}
        onClick={() => onSelect(entry.item.id)}
      >
        <span className="food-ring">
          <FoodIcon kind={iconFor(entry.item.category)} />
        </span>
        <span className="food-name">{entry.item.name}</span>
      </button>
    </li>
  );
}

/** One shelf, drawer or door rack: the first few, then "+3" for the rest. */
function Rack({
  label,
  entries,
  className,
  selected,
  onSelect,
  empty,
}: {
  label: string;
  entries: LitItem[];
  className: string;
  selected?: string;
  onSelect: (id: string) => void;
  empty?: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? entries : entries.slice(0, SHELF_SHOWN);
  const more = entries.length - shown.length;
  return (
    <div className={`rack ${className}`} role="group" aria-label={`${label}: ${entries.length}`}>
      {entries.length === 0 && empty ? <span className="rack-empty">{empty}</span> : null}
      <ul>
        {shown.map((entry) => (
          <FoodButton
            key={entry.item.id}
            entry={entry}
            selected={selected === entry.item.id}
            onSelect={onSelect}
          />
        ))}
        {more > 0 && (
          <li>
            <button type="button" className="food-more" onClick={() => setAll(true)}>
              +{more}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

interface Parts {
  kitchen: ReturnType<typeof arrangeKitchen>;
  selected?: string;
  onSelect: (id: string) => void;
}

function FridgeCompartment({ kitchen, selected, onSelect }: Parts) {
  const { shelves, door, drawer } = kitchen.fridge;
  const names = [
    'Prateleira de cima: usar já',
    'Prateleira do meio: esta semana',
    'Prateleira de baixo',
  ];
  return (
    <div className="compartment fridge-part" aria-label="Frigorífico" role="group">
      <div className="cavity">
        {shelves.map((entries, index) => (
          <Rack
            key={index}
            label={names[index]!}
            entries={entries}
            className={`shelf shelf-${index}`}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
        <Rack
          label="Gaveta dos legumes"
          entries={drawer}
          className="crisper"
          selected={selected}
          onSelect={onSelect}
        />
      </div>
      <Rack label="Porta" entries={door} className="door" selected={selected} onSelect={onSelect} />
    </div>
  );
}

function FreezerCompartment({
  kitchen,
  selected,
  onSelect,
  drawers = true,
}: Parts & { drawers?: boolean }) {
  const all = kitchen.freezer.drawers.flat();
  const racks = drawers ? kitchen.freezer.drawers : [all];
  return (
    <div className="compartment freezer-part" aria-label="Congelador" role="group">
      {racks.map((entries, index) => (
        <Rack
          key={index}
          label={drawers ? `Gaveta ${index + 1} do congelador` : 'Congelador'}
          entries={entries}
          className={drawers ? 'drawer' : 'freezer-shelf'}
          selected={selected}
          onSelect={onSelect}
          empty={index === 0 && all.length === 0 ? 'Vazio' : undefined}
        />
      ))}
    </div>
  );
}

function Pantry({ kitchen, selected, onSelect }: Parts) {
  return (
    <section className="appliance pantry" aria-label="Despensa">
      <h3 className="appliance-name">Despensa</h3>
      <div className="cavity">
        {kitchen.pantry.shelves.map((entries, index) => (
          <Rack
            key={index}
            label={`Prateleira ${index + 1} da despensa`}
            entries={entries}
            className="shelf"
            selected={selected}
            onSelect={onSelect}
            empty={index === 0 && kitchen.pantry.shelves.flat().length === 0 ? 'Vazia' : undefined}
          />
        ))}
      </div>
    </section>
  );
}

export function KitchenView({
  entries,
  layout,
  place,
  selected,
  onSelect,
}: {
  /** Sorted, soonest first. */
  entries: readonly LitItem[];
  layout: KitchenLayout;
  /** The "Onde" filter: one place, or all. */
  place: Location | 'tudo';
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const kitchen = arrangeKitchen(entries);
  const parts = { kitchen, selected, onSelect };
  const fridge = place === 'tudo' || place === 'frigorifico';
  const freezer = place === 'tudo' || place === 'congelador';
  const pantry = place === 'tudo' || place === 'despensa';
  const frozenCount = kitchen.freezer.drawers.flat().length;

  // One body for the combined fridges; apart for a chest freezer (or none).
  const together = layout !== 'separados' && layout !== 'so-frigorifico';
  return (
    <div className={`kitchen kitchen-${layout}`}>
      {together && (fridge || freezer) && (
        <section
          className="appliance fridge"
          aria-label={
            fridge && freezer ? 'Frigorífico e congelador' : fridge ? 'Frigorífico' : 'Congelador'
          }
        >
          <h3 className="appliance-name">{fridge ? 'Frigorífico' : 'Congelador'}</h3>
          <div className="appliance-body">
            {layout === 'combinado-cima' && freezer && (
              <FreezerCompartment {...parts} drawers={false} />
            )}
            {layout === 'americano' && freezer && <FreezerCompartment {...parts} />}
            {fridge && <FridgeCompartment {...parts} />}
            {layout === 'combinado-baixo' && freezer && <FreezerCompartment {...parts} />}
          </div>
        </section>
      )}
      {!together && fridge && (
        <section className="appliance fridge" aria-label="Frigorífico">
          <h3 className="appliance-name">Frigorífico</h3>
          <div className="appliance-body">
            <FridgeCompartment {...parts} />
          </div>
        </section>
      )}
      {!together && freezer && (layout === 'separados' || frozenCount > 0) && (
        <section className="appliance chest" aria-label="Arca congeladora">
          <h3 className="appliance-name">{layout === 'separados' ? 'Arca' : 'Congelador'}</h3>
          <div className="appliance-body">
            <FreezerCompartment {...parts} drawers={false} />
          </div>
        </section>
      )}
      {pantry && <Pantry {...parts} />}
    </div>
  );
}
