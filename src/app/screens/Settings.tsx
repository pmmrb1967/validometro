// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { AccountSections } from '../components/AccountSections';
import { AiSection } from '../components/AiSection';
import { DataSection } from '../components/DataSection';
import { InstallSection } from '../components/InstallSection';
import { useAccount } from '../account';
import { useOverrides } from '../rules';
import { useHealth } from '../useHealth';
import { KITCHEN_LAYOUT_LABELS, KITCHEN_LAYOUTS } from '../../domain/kitchen';
import { setKitchenLayout, useKitchenLayout } from '../kitchen-layout';

export function Settings() {
  const health = useHealth();
  const account = useAccount();
  const admin = account.status === 'ready' && account.me?.admin === true;
  const changedRules = useOverrides().length;
  const layout = useKitchenLayout();
  const { hash } = useLocation();
  // "Mudar o frigorífico" (Alimentos → Cozinha) lands on its card.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);
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

      <section className="card">
        <h2>Regras de validade</h2>
        <p className="hint">
          Quantos dias dura cada tipo de alimento quando não há data na embalagem. Se em tua casa
          algo dura mais ou menos, muda aqui.
          {changedRules > 0 &&
            ` ${changedRules === 1 ? 'Há 1 regra mudada' : `Há ${changedRules} regras mudadas`}.`}
        </p>
        <Link className="button secondary" to="/definicoes/validades">
          Ver e mudar as regras
        </Link>
      </section>

      <section className="card" id="cozinha">
        <h2>A tua cozinha</h2>
        <p className="hint">
          Como são o frigorífico e o congelador lá de casa, para o desenho em Alimentos → Cozinha se
          parecer com os teus. Fica só neste telemóvel.
        </p>
        <fieldset className="kitchen-layouts">
          <legend className="visually-hidden">Frigorífico e congelador</legend>
          {KITCHEN_LAYOUTS.map((option) => (
            <label key={option} className="check">
              <input
                type="radio"
                name="kitchen-layout"
                checked={layout === option}
                onChange={() => setKitchenLayout(option)}
              />
              <span>
                {KITCHEN_LAYOUT_LABELS[option].label}
                <small className="hint">{KITCHEN_LAYOUT_LABELS[option].hint}</small>
              </span>
            </label>
          ))}
        </fieldset>
      </section>

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
