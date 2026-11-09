// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link, Outlet, useLocation } from 'react-router';
import { LogoMark } from './Logo';

/** Top bar (brand, back or settings) and the current screen. */
export function AppShell() {
  const { pathname } = useLocation();
  const home = pathname === '/';
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Validómetro, início">
          <LogoMark size={46} />
          <span className="wordmark">Validómetro</span>
        </Link>
        {home ? (
          <Link to="/definicoes" className="topbar-link">
            Definições
          </Link>
        ) : (
          <Link to="/" className="topbar-link">
            Voltar
          </Link>
        )}
      </header>
      <main className="screen">
        <Outlet />
      </main>
    </>
  );
}
