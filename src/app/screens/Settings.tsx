// SPDX-License-Identifier: AGPL-3.0-or-later
import { InstallSection } from '../components/InstallSection';
import { useHealth } from '../useHealth';

export function Settings() {
  const health = useHealth();
  return (
    <div className="settings">
      <h1 className="page-title">Definições</h1>

      <InstallSection />

      <section className="card">
        <h2>Os teus dados</h2>
        <p className="hint">
          Sem conta, tudo o que registas fica só neste telemóvel (ou computador). Nada é enviado
          para o servidor, exceto o código de barras quando procuras um produto.
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
