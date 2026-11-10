// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link } from 'react-router';
import { AccountSections } from '../components/AccountSections';
import { AiSection } from '../components/AiSection';
import { DataSection } from '../components/DataSection';
import { InstallSection } from '../components/InstallSection';
import { useAccount } from '../account';
import { useHealth } from '../useHealth';

export function Settings() {
  const health = useHealth();
  const account = useAccount();
  const admin = account.status === 'ready' && account.me?.admin === true;
  return (
    <div className="settings">
      <h1 className="page-title">Definições</h1>

      {admin && (
        <section className="card">
          <h2>Administração</h2>
          <p className="hint">
            O uso do plano gratuito da Cloudflare, da IA e quantas pessoas usam a app.
          </p>
          <Link className="button secondary" to="/admin">
            Abrir o painel
          </Link>
        </section>
      )}

      <AccountSections />

      <InstallSection />

      <AiSection />

      <DataSection />

      <section className="card">
        <h2>Sobre</h2>
        <p className="hint">
          Validómetro: controla as validades dos alimentos lá de casa e desperdiça menos.{' '}
          <Link to="/sobre">Ver a apresentação</Link>.
        </p>
        <p className="hint" role="status">
          Servidor: {health}
        </p>
      </section>
    </div>
  );
}
