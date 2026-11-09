// SPDX-License-Identifier: AGPL-3.0-or-later
import { LogoMark } from '../Logo';

/** Traffic light (Phase 1). For now, the empty state. */
export function Home() {
  return (
    <section className="empty" aria-labelledby="empty-title">
      <div className="empty-mark">
        <LogoMark size={116} />
      </div>
      <h2 id="empty-title">Ainda não há nada registado</h2>
      <p>
        Em breve vais poder registar compras com uma foto do talão, o código de barras ou a voz.
      </p>
    </section>
  );
}
