# CLAUDE.md — Validómetro

Este ficheiro dá contexto ao Claude Code sobre o projeto. Lê-o sempre antes de começar uma tarefa e segue o plano em `planning/plan.md`.

## O que é

**Validómetro** é uma PWA gratuita para controlar as validades dos alimentos lá de casa e reduzir o desperdício. A ideia central é **fricção mínima**: registar uma compra deve levar segundos (foto do talão, código de barras ou voz), e marcar o que foi gasto deve levar um toque, de preferência a partir da própria notificação.

- Autor: Paulo Barbosa (copyright retido). Licença: **AGPL-3.0**.
- Público inicial: a família do autor. Deve poder abrir-se a outros utilizadores sem reescrever nada.
- Repositório sugerido: `pmmrb1967/validometro`.
- Projetos irmãos com a mesma stack e convenções: Wattómetro (`pmmrb1967/wattometro`), Faturómetro (`pmmrb1967/faturometro`). Em caso de dúvida sobre padrões (auth, estrutura de pastas, deploy, modo sem conta), seguir o que já existe no Wattómetro.

## Princípios de produto (não negociáveis)

1. **Só o que se estraga.** O foco são perecíveis (frescos, lacticínios, carne, peixe, produtos abertos). Itens de despensa de longa duração podem existir, mas ficam fora do semáforo por omissão.
2. **Quantidades são opcionais.** Um item tem estado (`ativo` → `consumido` / `deitado_fora`); `quantity` e `unit` são campos opcionais. Nunca obrigar o utilizador a indicar quantidades, e a UI deve funcionar sem elas.
3. **Fechar o ciclo com 1 toque.** Cada alerta permite responder "Comido / Deitado fora / Ainda tenho" sem abrir a app. Essas respostas alimentam a lista de compras e as estatísticas de desperdício.
4. **Aberto ≠ fechado.** Abrir um produto muda a validade efetiva (ex.: leite UHT fechado dura meses; aberto, 3–4 dias). A ação "Abri isto" é de primeira classe.
5. **Data impressa > estimativa.** Se houver data lida da embalagem ou introduzida pelo utilizador, usa-se essa. A tabela de regras é só fallback e é sempre editável com um toque.
6. **Custo zero por omissão.** Alojamento no plano gratuito da Cloudflare; IA via Workers AI (quota gratuita) ou chave própria do utilizador. Nada de serviços que exijam cartão (ex.: não usar R2).
7. **Privacidade.** Fotos de talões e produtos são processadas e descartadas. Nunca são guardadas no servidor. O modo sem conta não guarda nada no servidor.

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Cloudflare Workers (plano Free) |
| Backend | Hono + TypeScript |
| Base de dados | Cloudflare D1 (SQLite) |
| Frontend | PWA servida pelo próprio Worker (assets estáticos): Vite + React 18 + `react-router` + TypeScript, como no Wattómetro. Lógica de domínio em `src/domain/`, sem React |
| Armazenamento local | IndexedDB (modo sem conta e cache offline) |
| Agendamento | Cron Triggers do Worker (verificação diária de validades) |
| Notificações | Web Push (VAPID) |
| IA (visão/texto) | Workers AI por omissão; Gemini Flash-Lite ou Claude com chave do utilizador |
| Códigos de barras | `BarcodeDetector` nativo com fallback zxing-js (Safari/iOS não tem `BarcodeDetector`) |
| Dados de produto | API Open Food Facts (gratuita), com cache em D1 |
| Voz | Web Speech API no browser |

### Limites do plano gratuito a respeitar
- O CPU por invocação do Worker é muito curto: **não descodificar nem redimensionar imagens no Worker.** O redimensionamento (máx. ~1600 px no lado maior, JPEG ~0.7) é feito no cliente antes do upload. O Worker só reencaminha bytes para a API de IA (o tempo de espera de `fetch` não conta como CPU).
- Workers AI: quota diária partilhada de Neurons. Registar o consumo em `ai_usage` e degradar com elegância quando a quota estiver perto do fim (sugerir chave própria ou entrada manual). Cada dispositivo (ou conta) tem a sua parte do dia e cada endereço umas poucas leituras por minuto (`src/worker/free-ai.ts`), para uma pessoa ou um script não gastar a de todos.
- D1: manter as consultas indexadas; o painel de admin mostra tamanho da BD e consultas diárias.

## Identidade visual

- **Cor da marca: azul-frio `#163a5f`** (o frigorífico, a conservação). Fundo `#f3f6f8`. O verde do Faturómetro (`#1f5c4a`) e o roxo do Wattómetro (`#2e2250`) ficam de fora, para os irmãos não se confundirem.
- As cores do **semáforo** (`--fresh` `#4cb873`, `--soon` `#f2b33d`, `--expired` `#ef5b4c`, com variantes `*-text` para texto) são as únicas cores quentes e saturadas do ecrã. Não as usar para decoração.
- **Logótipo:** mostrador da família "-ómetro" dividido nos três segmentos do semáforo, com uma **folha como ponteiro** a apontar para o verde. Fonte: `public/icon.svg` (os PNG geram-se com `pnpm icons`); no código, `LogoMark` em `src/app/Logo.tsx`.
- Tipografia: Bricolage Grotesque (títulos e wordmark), como nos irmãos; corpo em fonte do sistema.

## Arquitetura (resumo)

```
[PWA] ──(HTTPS JSON)──> [Worker Hono]
  │  IndexedDB              ├── /api/items, /api/households, /api/shopping …
  │  BarcodeDetector/zxing  ├── /api/ingest/receipt   → IA visão → JSON estruturado
  │  Web Speech             ├── /api/ingest/voice     → IA texto → JSON estruturado
  │  resize de imagem       ├── /api/ingest/date      → IA visão → data impressa
  │                         ├── /api/products/:ean    → cache D1 → Open Food Facts
  │                         ├── /api/push/*           → subscrições Web Push
  │                         └── scheduled()           → cron diário → alertas push
  └── Service Worker (offline + receção de push + ações da notificação)
                            [D1]
```

Os três fluxos de entrada (talão, voz, código de barras) produzem **a mesma estrutura intermédia** (`DraftItem[]`), que o utilizador revê num ecrã de confirmação antes de gravar. A IA nunca grava diretamente no inventário.

## Modelo de dados (D1)

Esquema de referência; as migrações ficam em `migrations/`.

- `users` (id, email/identidade, created_at, ai_provider, ai_key_encrypted nullable)
- `households` (id, name, invite_code, created_at)
- `household_members` (household_id, user_id, role: `owner` | `member`)
- `items`
  - id, household_id, created_by
  - name, category, location (`frigorifico` | `congelador` | `despensa`)
  - ean nullable
  - quantity **nullable**, unit **nullable**
  - purchased_at, opened_at nullable
  - expires_at, expiry_source (`impressa` | `estimada` | `manual`)
  - expiry_kind nullable (`consumir_ate` | `consumir_de_preferencia`; nulo = o habitual da categoria, `src/domain/date-kind.ts`)
  - price **nullable** (euros, do talão ou escrito; conta o desperdício em euros e as compras do mês)
  - receipt_id nullable (o talão de onde veio: o preço já está no total desse talão; sem talão, o preço conta sozinho nas compras)
  - status (`ativo` | `consumido` | `deitado_fora`), resolved_at nullable
  - índices: (household_id, status, expires_at)
- `product_aliases`: dicionário partilhado de abreviaturas dos talões
  - raw_text_normalized (PK com store), store nullable, canonical_name, category, perishable, hits, updated_at
- `products`: cache do Open Food Facts por EAN (ean PK, name, brand, category, fetched_at)
- `shelf_life_rules`: (category, location, state `fechado`|`aberto`, days_default, notes)
- `push_subscriptions`: (id, user_id, endpoint, keys_json, created_at)
- `shopping_list`: (id, household_id, name, source `auto`|`manual`, done, created_at)
- `ai_usage`: (date, user_id nullable, provider, operation, units, ok)
- `ai_free_daily`: a parte de cada dispositivo (ou conta) na IA gratuita do dia (date, subject = sha256(segredo + dia + id), calls, neurons); só hoje e ontem (`src/worker/free-ai.ts`)
- `receipts`: nota de cada talão guardado, para reconhecer o mesmo talão lido duas vezes (`src/domain/receipts.ts`): hash do NIF da loja + n.º do documento do código QR da AT, loja, dia, hashes curtos das linhas, total pago (do QR ou soma dos preços lidos; `src/domain/spending.ts`), nome e preço de cada linha para a estimativa da lista de compras (`src/domain/prices.ts`). Nunca o talão nem o NIF do comprador

## Pipeline de IA

1. O cliente redimensiona a imagem e envia-a para `/api/ingest/receipt`.
2. O Worker escolhe o fornecedor: chave do utilizador (Gemini/Claude) se configurada, senão Workers AI.
   Modelos atuais: Workers AI `@cf/google/gemma-4-26b-a4b-it` (raciocínio desligado), Gemini `gemini-3.5-flash-lite` (REST), Claude via `@anthropic-ai/sdk` (Opus 5.5 por omissão; o utilizador pode escolher Sonnet/Haiku). Sem contas, a chave vem no cabeçalho `x-ai-key` de cada pedido e não é guardada no servidor. Gemini: no EEE, os termos da Gemini API (desde 23/03/2026) só permitem serviços pagos, ou seja, chave de um projeto Google Cloud com faturação ativa; nunca anunciar o "plano gratuito" do AI Studio.
3. O prompt pede **apenas JSON** segundo um esquema fixo: `{ store, date, lines: [{ raw, name, category, quantity?, unit?, perishable }] }`. Validar sempre com Zod. Se a validação falhar, tentar uma vez e depois devolver erro amigável.
4. Para cada linha, consultar `product_aliases` pelo `raw` normalizado. Uma correspondência conhecida sobrepõe-se à interpretação da IA.
5. Aplicar `shelf_life_rules` às linhas perecíveis para propor `expires_at` (`expiry_source = 'estimada'`).
6. Devolver `DraftItem[]` ao cliente para revisão.
7. Quando o utilizador confirma (e eventualmente corrige um nome), fazer upsert em `product_aliases` e incrementar `hits`.

Os textos (talão em PDF, voz) passam por `src/domain/anonymize.ts` no telemóvel e outra vez no Worker antes de chegarem à IA. Prompts versionados em `src/ai/prompts/`. Fornecedores atrás de uma interface comum (`src/ai/providers/`), para trocar de modelo sem mexer no resto. Nunca registar em log o conteúdo das imagens nem as chaves.

## Convenções

- Código, identificadores e commits em **inglês**; UI, mensagens ao utilizador e documentação em **português europeu** (pt-PT: "ecrã", "telemóvel", "registar", "utilizador").
- TypeScript estrito. Validação de input com Zod em todas as rotas.
- Datas em ISO 8601 (UTC) na BD; apresentação no fuso `Europe/Lisbon`. A validade (`expires_at`) é um dia, não um instante: guarda-se como `YYYY-MM-DD` e conta-se em dias de calendário de Lisboa (`src/domain/dates.ts`).
- Lógica de domínio (regras de validade, semáforo, categorias) em `src/domain/`, partilhada pela app e pelo Worker. As regras existem em `src/domain/shelf-life.ts` e no seed da D1; `test/shelf-life-sync.test.ts` garante que são iguais (alterar as duas, com migração nova).
- Chaves de API de utilizadores cifradas em repouso (AES-GCM com segredo do Worker).
- Testes com Vitest (`@cloudflare/vitest-plugin` para rotas e D1).
- Commits pequenos e frequentes; cada fase do plano termina com a app a funcionar e deployada.

## Comandos

```bash
npm install
npx wrangler d1 create validometro            # uma vez
npx wrangler d1 migrations apply validometro --local
npm run dev                                    # wrangler dev
npm test
npx wrangler d1 migrations apply validometro --remote
npm run deploy
```

Segredos (`wrangler secret put`): `SESSION_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `KEY_ENCRYPTION_SECRET`, `ADMIN_EMAILS`, `CF_ANALYTICS_TOKEN` (opcional: token só de leitura "Account Analytics: Read", para o painel mostrar pedidos ao Worker e linhas da D1). Para `wrangler dev`, `SESSION_SECRET` e `KEY_ENCRYPTION_SECRET` vão em `.dev.vars` (não versionado).

Painel de admin em `/admin` (só para `ADMIN_EMAILS`). O Cron corre de hora a hora: vigia os limites do plano gratuito (`src/worker/monitor.ts`, avisos por push aos admins aos 70% e 90%) e, às 9h de Lisboa, envia o alerta diário. Testes ponta a ponta: `pnpm build && pnpm test:e2e` (`e2e/`, servidor em `scripts/e2e-server.mjs`).

## O que NÃO fazer

- Não guardar fotos (nem em D1, nem em R2, nem em KV).
- Não tornar quantidades obrigatórias em nenhum fluxo.
- Não chamar a IA para coisas que o código de barras + Open Food Facts ou o dicionário de aliases já resolvem.
- Não gravar no inventário sem passar pelo ecrã de revisão.
- Não adicionar dependências que não corram no runtime dos Workers (ex.: módulos Node nativos, `sharp`).
- Não introduzir serviços pagos ou que exijam cartão sem perguntar primeiro.
