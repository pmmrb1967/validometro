// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { APP_COMMIT, APP_VERSION, LICENSE_URL, SOURCE_URL } from './build-info';
import { signOut, useAccount } from './account';
import { ApiError } from './api';
import { feedbackLink } from './feedback';
import { useShowLanding } from './landing-state';
import { t } from './i18n/pt-PT';
import { Tabs } from './components/Tabs';
import { LogoMark } from './Logo';
import { applyUpdate, useUpdateAvailable } from './pwa';
import { forgetStarted } from './started';

/**
 * Top bar (brand with the email or "sem conta", "Criar conta", "admin", "Sair"), the sections
 * (components/Tabs.tsx), the new-version bar, the current screen and the footer. "Sair" ends on
 * the landing page: signing out with an account; without one, the items stay in this browser
 * and "Começar sem conta" opens them again.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const updateAvailable = useUpdateAvailable();
  const home = pathname === '/';
  const account = useAccount();
  const signedOut = account.status === 'ready' && !account.me;
  const onSignIn = pathname === '/entrar' || pathname === '/criar-conta' || pathname === '/conta';
  // Before starting there is nothing to show: the landing page offers only "Entrar".
  const showLanding = useShowLanding();
  const landing = home && showLanding !== false;
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const signedIn = account.status === 'ready' && Boolean(account.me);
  // The app itself (not the landing page or signing in): the tabs, who is in, and "Sair".
  const inApp = !landing && !onSignIn && pathname !== '/sobre' && account.status === 'ready';
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
  const me = account.status === 'ready' ? account.me : undefined;
  const isAdmin = signedIn && me?.admin === true;
  return (
    <div className={inApp ? 'shell with-tabs' : 'shell'}>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Validómetro, início">
          <LogoMark size={42} />
          <span className="brand-text">
            <span className="wordmark">Validómetro</span>
            {/* Always in sight: whose data this is, or that it stays in this browser. */}
            {inApp && <span className="brand-sub">{me ? me.email : 'sem conta'}</span>}
          </span>
        </Link>
        {inApp && <Tabs className="tabs tabs-top" />}
        <div className="topbar-links">
          {landing && signedOut && (
            <Link to="/entrar" className="topbar-link">
              Entrar
            </Link>
          )}
          {!landing && !inApp && (
            <Link to="/" className="topbar-link">
              Voltar
            </Link>
          )}
          {inApp && isAdmin && (
            <Link to="/admin" className="topbar-badge" aria-label="Admin: abrir o painel">
              admin
            </Link>
          )}
          {inApp && signedOut && (
            <Link to="/criar-conta" className="topbar-link">
              Criar conta
            </Link>
          )}
          {inApp && (
            <button
              type="button"
              className="topbar-link"
              disabled={leaving}
              onClick={() => void leave()}
            >
              Sair
            </button>
          )}
        </div>
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
      {inApp && <Tabs className="tabs tabs-bottom" />}
    </div>
  );
}
