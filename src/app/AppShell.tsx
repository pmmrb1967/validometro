// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link, Outlet } from 'react-router';
import { LogoMark } from './Logo';
import { useHealth } from './useHealth';

/** Top bar, the current screen and a status line (connection, version). */
export function AppShell() {
  const health = useHealth();
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          <LogoMark size={46} />
          <span className="wordmark">Validómetro</span>
        </Link>
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
