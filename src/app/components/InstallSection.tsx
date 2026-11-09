// SPDX-License-Identifier: AGPL-3.0-or-later
import { useInstallState } from '../install';
import { t } from '../i18n/pt-PT';
import { InstallButton } from './InstallButton';

/** "Aplicação" card: install the PWA on this phone or computer; gone once it is installed here. */
export function InstallSection() {
  const { kind } = useInstallState();
  if (kind === 'installed' || kind === 'installed-elsewhere') return null;
  return (
    <section className="card">
      <h2>{t.install.title}</h2>
      <p className="hint">{t.install.intro}</p>
      <InstallButton className="secondary" />
    </section>
  );
}
