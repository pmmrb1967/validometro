// SPDX-License-Identifier: AGPL-3.0-or-later
import { AiSection } from '../components/AiSection';
import { InstallSection } from '../components/InstallSection';
import { useHealth } from '../useHealth';

export function Settings() {
  const health = useHealth();
  return (
    <div className="settings">
      <h1 className="page-title">Definições</h1>

      <InstallSection />

      <AiSection />

      <section className="card">
        <h2>Os teus dados</h2>
        <p className="hint">
          Sem conta, tudo o que registas fica só neste telemóvel (ou computador). Ao servidor só vão
          o código de barras, quando procuras um produto, e as fotos ou o que ditas, para serem
          lidos; nada disso fica guardado. O servidor aprende as abreviaturas dos talões que
          confirmas (ex.: "IOG NAT" é iogurte natural), sem saber de quem são.
        </p>
      </section>

      <section className="card">
        <h2>Sobre</h2>
        <p className="hint">
          Validómetro: controla as validades dos alimentos lá de casa e desperdiça menos.
        </p>
        <p className="hint" role="status">
          Servidor: {health}
        </p>
      </section>
    </div>
  );
}
