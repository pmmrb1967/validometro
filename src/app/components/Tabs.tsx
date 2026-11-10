// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The app's sections, as in Wattómetro and Faturómetro: a bar fixed at the bottom on a phone,
 * within reach of the thumb, and the same links in the top bar on a wide screen (styles.css).
 * "Adicionar" is not a tab: it is the round button on the home screen.
 */
import { NavLink } from 'react-router';

const TABS = [
  { to: '/', label: 'Alimentos', icon: 'items' },
  { to: '/compras', label: 'Compras', icon: 'shopping' },
  { to: '/receitas', label: 'Receitas', icon: 'recipes' },
  { to: '/desperdicio', label: 'Desperdício', icon: 'waste' },
  { to: '/definicoes', label: 'Definições', icon: 'settings' },
] as const;

const PATHS: Record<(typeof TABS)[number]['icon'], string> = {
  // A fridge.
  items:
    'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM6 10h12M9 6v2M9 13v3',
  // A basket.
  shopping: 'M3 9h18l-2 11H5L3 9ZM8 9l3-5M16 9l-3-5M9 13v3M15 13v3',
  // A pan.
  recipes: 'M3 11h14v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-3ZM17 12h4M7 7c0-1 1-1 1-2M11 7c0-1 1-1 1-2',
  // A bin.
  waste: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5',
  // Sliders.
  settings: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
};

function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg
      className="tab-icon"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Tabs({ className }: { className: string }) {
  return (
    <nav className={className} aria-label="Secções">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className="tab">
          <Icon name={tab.icon} />
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
