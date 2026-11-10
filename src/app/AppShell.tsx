// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link, Outlet, useLocation } from 'react-router';
import { APP_COMMIT, APP_VERSION, LICENSE_URL, SOURCE_URL } from './build-info';
import { useAccount } from './account';
import { feedbackLink } from './feedback';
import { useShowLanding } from './landing-state';
import { t } from './i18n/pt-PT';
import { LogoMark } from './Logo';
import { applyUpdate, useUpdateAvailable } from './pwa';

/** Top bar (brand, back or settings), the new-version bar, the current screen and the footer. */
export function AppShell() {
  const { pathname } = useLocation();
  const updateAvailable = useUpdateAvailable();
  const home = pathname === '/';
  const account = useAccount();
  const signedOut = account.status === 'ready' && !account.me;
  const onSignIn = pathname === '/entrar' || pathname === '/criar-conta' || pathname === '/conta';
  // Before starting there is nothing to set: the landing page offers only "Entrar".
  const showLanding = useShowLanding();
  const landing = home && showLanding !== false;
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Validómetro, início">
          <LogoMark size={46} />
          <span className="wordmark">Validómetro</span>
        </Link>
        <nav className="topbar-links">
          {signedOut && !onSignIn && (
            <Link to="/entrar" className="topbar-link">
              Entrar
            </Link>
          )}
          {home ? (
            !landing && (
              <Link to="/definicoes" className="topbar-link">
                Definições
              </Link>
            )
          ) : (
            <Link to="/" className="topbar-link">
              Voltar
            </Link>
          )}
        </nav>
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
          {!landing && pathname !== '/sobre' && <Link to="/sobre">Sobre a app</Link>}
          <Link to="/privacidade">Privacidade</Link>
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
