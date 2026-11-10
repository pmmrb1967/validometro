// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * The first page for someone new (no account, nothing registered): what the app does, and
 * three ways in. Who already uses it goes straight to the traffic light (Home), so the
 * installed icon never opens a presentation. "/sobre" shows it again at any time (footer link);
 * there the buttons lead back to the app instead of starting it again.
 */
import { Link, useNavigate } from 'react-router';
import { useAccount } from '../account';
import { InstallSection } from '../components/InstallSection';
import { markStarted, useStarted } from '../started';

const PREVIEW = [
  { name: 'Iogurtes naturais', when: 'Expira hoje', light: 'red' },
  { name: 'Peito de frango', when: 'Faltam 3 dias', light: 'amber' },
  { name: 'Queijo curado', when: 'Faltam 24 dias', light: 'green' },
] as const;

const WAYS = [
  {
    title: 'Foto do talão',
    body: 'Tira uma foto à saída do supermercado. A app lê as linhas, percebe as abreviaturas e propõe as validades.',
  },
  {
    title: 'Código de barras',
    body: 'Aponta a câmara ao produto. O nome vem da Open Food Facts; a data lês da embalagem com outra foto.',
  },
  {
    title: 'Voz',
    body: '“Comprei ovos, dois iogurtes e um frango que é até sexta.” Fica tudo registado, com a data que disseste.',
  },
];

const MORE = [
  {
    title: 'Aberto não é fechado',
    body: 'Leite UHT fechado dura meses; aberto, três ou quatro dias. Um toque em “Abri isto” e a validade muda.',
  },
  {
    title: 'A família na mesma despensa',
    body: 'Partilha um convite e todos veem o mesmo frigorífico e a mesma lista de compras, cada um no seu telemóvel.',
  },
  {
    title: 'Lista de compras que se faz sozinha',
    body: 'O que foi comido volta à lista como sugestão. O que foi para o lixo não: a app pergunta se compraste demais.',
  },
  {
    title: 'O que jantar hoje?',
    body: 'Duas ou três receitas simples com o que está a acabar. E, ao fim do mês, quanto foi aproveitado.',
  },
];

/** The main buttons: start (or go back to the app) and, without a session, the account ones. */
function Actions({ className }: { className: string }) {
  const navigate = useNavigate();
  const account = useAccount();
  const started = useStarted();
  const signedIn = account.status === 'ready' && Boolean(account.me);
  const start = () => {
    markStarted();
    void navigate('/');
  };
  return (
    <div className={className}>
      <button type="button" className="primary" onClick={start}>
        {started || signedIn ? 'Abrir a app' : 'Começar sem conta'}
      </button>
      {!signedIn && (
        <>
          <Link className="button secondary" to="/criar-conta">
            Criar conta
          </Link>
          <Link className="button ghost" to="/entrar">
            Já tenho conta
          </Link>
        </>
      )}
    </div>
  );
}

export function Landing() {
  return (
    <div className="landing">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-copy">
          <h1 id="landing-title" className="landing-title">
            O que está no frigorífico, por ordem de usar.
          </h1>
          <p className="landing-lead">
            O Validómetro guarda as validades dos alimentos lá de casa e avisa o que usar primeiro,
            para deitar menos comida fora. Registar uma compra leva segundos; responder ao alerta,
            um toque.
          </p>
          <Actions className="landing-actions" />
          <p className="hint">
            Sem conta, tudo fica só neste telemóvel. A conta serve para partilhar com a família e
            receber o alerta diário; podes criá-la depois sem perder nada.
          </p>
        </div>

        <div className="landing-preview" aria-hidden="true">
          <div className="preview-notification">
            <p className="preview-app">Validómetro, 09:00</p>
            <p className="preview-title">Iogurtes naturais: expira hoje</p>
            <p className="preview-body">A seguir: Peito de frango.</p>
            <div className="preview-actions">
              <span>Comido</span>
              <span>Deitado fora</span>
              <span>Ainda tenho</span>
            </div>
          </div>
          <ul className="preview-list">
            {PREVIEW.map((item) => (
              <li key={item.name} className={`preview-item light-${item.light}`}>
                <span className="preview-dot" />
                <span className="preview-name">{item.name}</span>
                <span className="preview-when">{item.when}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="landing-band" aria-labelledby="landing-ways">
        <h2 id="landing-ways">Três maneiras de registar, nenhuma obriga a escrever</h2>
        <div className="landing-grid">
          {WAYS.map((way) => (
            <article key={way.title} className="landing-feature">
              <h3>{way.title}</h3>
              <p>{way.body}</p>
            </article>
          ))}
        </div>
        <p className="hint">
          Antes de gravar, revês sempre a lista. Quantidades são opcionais: basta saber que há.
        </p>
      </section>

      <section className="landing-band" aria-labelledby="landing-more">
        <h2 id="landing-more">Pensado para o dia a dia</h2>
        <div className="landing-grid landing-grid-two">
          {MORE.map((item) => (
            <article key={item.title} className="landing-feature">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-band landing-privacy" aria-labelledby="landing-privacy">
        <h2 id="landing-privacy">Gratuito, aberto e discreto</h2>
        <p>
          As fotos de talões e embalagens são lidas e apagadas logo a seguir: nunca ficam guardadas.
          Não há publicidade nem estatísticas de visitas. O código é aberto (AGPL-3.0).{' '}
          <Link to="/privacidade">Como são tratados os teus dados</Link>.
        </p>
      </section>

      <InstallSection />

      <Actions className="landing-final" />
    </div>
  );
}
