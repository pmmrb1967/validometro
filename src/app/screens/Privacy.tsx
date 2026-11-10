// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/** What is kept, where, and for how long: plain words, matching what the code does. */
import { Link } from 'react-router';
import { FEEDBACK_EMAIL } from '../feedback';

export function Privacy() {
  return (
    <article className="privacy">
      <h1 className="page-title">Privacidade</h1>
      <p className="landing-lead">
        O Validómetro guarda o mínimo para funcionar e nada para vender. Não tem publicidade nem
        estatísticas de visitas.
      </p>

      <section className="card">
        <h2>Sem conta</h2>
        <p>
          O que registas fica só neste telemóvel (ou computador), no armazenamento do browser. O
          servidor não guarda nada teu. Em Definições podes descarregar um ficheiro com tudo ou
          apagar o que está neste telemóvel.
        </p>
      </section>

      <section className="card">
        <h2>Com conta</h2>
        <p>Ficam guardados no servidor (Cloudflare, na União Europeia):</p>
        <ul>
          <li>o teu email e a palavra-passe, esta só em forma cifrada (nunca a original);</li>
          <li>
            os alimentos (com o preço, se o talão o tiver ou o escreveres) e a lista de compras da
            tua casa, visíveis só para quem lá está;
          </li>
          <li>os endereços de notificação dos telemóveis onde ligaste o alerta diário;</li>
          <li>a tua chave de IA, se a guardares na conta, cifrada;</li>
          <li>o último dia em que abriste a app, só para contar quantas pessoas a usam;</li>
          <li>
            depois de várias tentativas de entrada falhadas, por pouco tempo, uma marca cifrada do
            endereço de rede, para travar quem tente adivinhar palavras-passe.
          </li>
        </ul>
        <p>
          O único cookie é o da sessão, para não teres de entrar sempre. Em Definições podes
          descarregar um ficheiro com tudo o que está guardado. Ao apagar a conta, apagam-se os teus
          dados e, se mais ninguém estiver na tua casa, os alimentos e a lista.
        </p>
      </section>

      <section className="card">
        <h2>Fotos, voz e IA</h2>
        <p>
          As fotos de talões e de datas são reduzidas no telemóvel, enviadas para serem lidas por IA
          e apagadas logo a seguir: nunca ficam guardadas. O reconhecimento de voz é feito pelo
          browser (no Chrome, com os serviços da Google); à app chega só o texto.
        </p>
        <p>
          Por omissão, a leitura é feita pela Workers AI da Cloudflare. Se escolheres usar a tua
          chave, o pedido vai para esse serviço (Google Gemini ou Anthropic Claude), segundo as
          condições dele. Para as receitas vão só os nomes dos alimentos a acabar.
        </p>
        <p>
          O servidor aprende as abreviaturas dos talões que confirmas (ex.: “IOG NAT” é iogurte
          natural), sem guardar de quem são. Os códigos de barras procurados ficam em cache, também
          sem dono.
        </p>
      </section>

      <section className="card">
        <h2>Dúvidas</h2>
        <p>
          Escreve para <a href={`mailto:${FEEDBACK_EMAIL}`}>{FEEDBACK_EMAIL}</a>. O código está
          aberto no GitHub, para quem quiser confirmar.
        </p>
        <Link className="button secondary" to="/">
          Voltar
        </Link>
      </section>
    </article>
  );
}
