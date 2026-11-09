// SPDX-License-Identifier: AGPL-3.0-or-later
import { Outlet } from 'react-router';
import { useHealth } from './useHealth';

/** Top bar, the current screen and a status line (connection, version). */
export function AppShell() {
  const health = useHealth();
  return (
    <>
      <header className="topbar">
        <h1>Validómetro</h1>
      </header>
      <main className="screen">
        <Outlet />
      </main>
      <footer className="status">
        <span role="status">{health}</span>
        <span className="version">v{__APP_VERSION__}</span>
      </footer>
    </>
  );
}
