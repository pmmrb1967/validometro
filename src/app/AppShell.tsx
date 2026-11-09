// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link, Outlet, useLocation } from 'react-router';
import { APP_COMMIT, APP_VERSION, LICENSE_URL, SOURCE_URL } from './build-info';
import { feedbackLink } from './feedback';
import { t } from './i18n/pt-PT';
import { LogoMark } from './Logo';
import { applyUpdate, useUpdateAvailable } from './pwa';

/** Top bar (brand, back or settings), the new-version bar, the current screen and the footer. */
export function AppShell() {
  const { pathname } = useLocation();
  const updateAvailable = useUpdateAvailable();
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
      {updateAvailable && (
        <div className="update-banner" role="status">
          <span>
            <strong>{t.update.available}</strong> {t.update.hint}
          </span>
          <button type="button" className="primary compact" onClick={applyUpdate}>
            {t.update.apply}
          </button>
        </div>
      )}
      <main className="screen">
        <Outlet />
      </main>
      <footer className="footer">
        <p>{t.legal.copyright}</p>
        <p className="footer-links">
          <a href={feedbackLink(pathname)}>{t.feedback.footer}</a>
          <a href={LICENSE_URL} rel="noreferrer">
            {t.legal.license}
          </a>
          <a href={SOURCE_URL} rel="noreferrer">
            {t.legal.source}
          </a>
        </p>
        <p>{t.legal.version(APP_VERSION, APP_COMMIT)}</p>
      </footer>
    </>
  );
}
