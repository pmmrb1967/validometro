// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { APP_COMMIT, APP_VERSION, LICENSE_URL, SOURCE_URL } from './build-info';
import { signOut, useAccount } from './account';
import { ApiError } from './api';
import { feedbackLink } from './feedback';
import { useShowLanding } from './landing-state';
import { t } from './i18n/pt-PT';
import { LogoMark } from './Logo';
import { applyUpdate, useUpdateAvailable } from './pwa';
import { forgetStarted } from './started';

/**
 * Top bar (brand, back or settings, "Sair"), the new-version bar, the current screen and the
 * footer. "Sair" ends on the landing page: signing out with an account; without one, the items
 * stay on this phone and "Começar sem conta" opens them again.
 */
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
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const signedIn = account.status === 'ready' && Boolean(account.me);
  const canLeave = !landing && !onSignIn && pathname !== '/sobre' && account.status === 'ready';
  const leave = async () => {
    setLeaving(true);
    try {
      if (signedIn) await signOut();
      else forgetStarted();
      void navigate('/', { replace: true });
    } catch (err) {
      // Offline, say: the session stays, and "Sair" can be tried again.
      window.alert(
        err instanceof ApiError ? err.message : 'Não foi possível sair. Tenta outra vez.',
      );
    } finally {
      setLeaving(false);
    }
  };
  return (
    <>
      {/* Three links do not fit beside the wordmark on a phone: the logo stays alone. */}
      <header className={`topbar${signedOut && !onSignIn && canLeave ? ' crowded' : ''}`}>
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
          {canLeave && (
            <button
              type="button"
              className="topbar-link"
              disabled={leaving}
              onClick={() => void leave()}
            >
              Sair
            </button>
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
