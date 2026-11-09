# Plano — Validómetro

Plano de implementação por fases. Cada fase termina com a app **a funcionar, testada e deployada** em `*.workers.dev`. Marcar as tarefas `[x]` à medida que ficam concluídas. Ver `CLAUDE.md` para princípios, stack e convenções.

**Objetivo do MVP (fim da Fase 3):** a família regista compras com talão, código de barras ou voz; vê o semáforo de validades; recebe um alerta diário a que responde com um toque; e partilha a mesma despensa entre telemóveis.

---

## Fase 0 — Fundações

- [x] Inicializar o projeto (Hono + TypeScript + Wrangler), `package.json`, `tsconfig` estrito, ESLint/Prettier
- [x] `LICENSE` AGPL-3.0 e cabeçalho de copyright
- [x] Criar a BD D1 `validometro` (UE) e a primeira migração com o esquema de `CLAUDE.md`
- [x] Seed de `shelf_life_rules` (ver tabela no fim deste ficheiro)
- [x] Shell da PWA: `manifest.webmanifest`, ícones, Service Worker com cache offline básico, layout mobile-first
- [x] Vitest + `@cloudflare/vitest-plugin` (antigo `vitest-pool-workers`) com um teste de rota e um de D1
- [ ] Primeiro deploy (feito: https://app.validometro.workers.dev) e verificação da instalação da PWA em Android e iPhone

**Pronto quando:** a PWA instala-se no telemóvel e mostra um ecrã vazio servido pelo Worker com a D1 ligada.

## Fase 1 — Inventário local e semáforo (sem conta, sem IA)

- [x] Camada de dados local em IndexedDB com a mesma forma que `items` (para migrar depois para D1)
- [x] Adicionar item manualmente: nome, localização, categoria (sugerida), validade (sugerida pelas regras), **quantidade opcional**
- [x] Ecrã **Semáforo** (home):
  - Vermelho: expira em ≤ 2 dias (ou já expirou)
  - Amarelo: expira em ≤ 7 dias
  - Verde: resto
  - Filtros por localização; itens de longa duração escondidos por omissão
- [x] Ações rápidas por item (swipe ou botões): **Comido**, **Deitado fora**, **Abri isto** (recalcula a validade com a regra `aberto`), **Editar data**
- [x] Leitura de código de barras: `BarcodeDetector` com fallback zxing-js
- [x] Rota `/api/products/:ean`: cache em `products`, senão Open Food Facts; preenche nome e categoria
- [x] Testes: regras de validade (fechado/aberto/localização), limites do semáforo

**Pronto quando:** dá para usar a app a sério, só com o telemóvel, sem conta.

## Fase 2 — Entrada com IA (talão, data impressa, voz)

- [x] Interface `AiProvider` com implementações Workers AI, Gemini e Claude; escolha por utilizador (`src/ai/providers/`)
- [x] Definições: o utilizador cola a sua chave ou fica com Workers AI. Sem contas, a chave fica só no dispositivo e vai em cada pedido (o servidor não a guarda); a cifra em repouso (AES-GCM) chega com as contas, na Fase 3
- [x] Redimensionamento da imagem no cliente antes do upload (1600 px, JPEG 0,7)
- [x] `/api/ingest/receipt`: prompt → JSON validado com Zod (uma repetição) → aliases → regras de validade → `DraftItem[]`
- [x] Ecrã de **revisão** (`/rever`): lista editável; longa duração desmarcada por omissão; corrigir nome, tipo, local e data (ou ler a data por foto); quantidade opcional
- [x] Ao confirmar: upsert em `product_aliases` (aprendizagem partilhada)
- [x] `/api/ingest/date`: foto da data impressa na embalagem → `expires_at` com `expiry_source = 'impressa'`
- [x] Voz: Web Speech API (ou escrever a lista) → `/api/ingest/voice` → `DraftItem[]` → mesmo ecrã de revisão
- [x] Registo em `ai_usage` (Neurons estimados no Workers AI); pára antes de esgotar a quota diária, com mensagem amigável
- [ ] Conjunto de teste com 10–15 talões reais (Continente, Pingo Doce, Lidl, Auchan, Mercadona) para comparar fornecedores em precisão e custo. Guardar só o texto esperado, nunca as imagens, no repositório
- [ ] Decidir o fornecedor por omissão com base nesse teste (provisório: Workers AI com `@cf/google/gemma-4-26b-a4b-it`)

**Pronto quando:** um talão típico de supermercado português resulta num rascunho com ≥ 80% das linhas corretas e o resto corrige-se no ecrã de revisão.

## Fase 3 — Contas, família e alertas

- [x] Autenticação: reutilizar o mecanismo do Wattómetro/Faturómetro (PBKDF2, cookie `__Host-vm_session` assinado com HMAC, 90 dias, bloqueio após falhas repetidas)
- [x] Agregado familiar: criar, convidar por código/link (`/conta?convite=CÓDIGO`), sair. Quem entra sozinho leva os seus alimentos; quem sai fica com uma casa nova e vazia
- [x] Migração do inventário local (IndexedDB) para D1 ao criar conta
- [x] Sincronização simples: o servidor é a fonte de verdade; cache offline com fila de alterações pendentes (`outbox`), ganha a alteração mais recente (`updated_at`), cursor por `server_seq`
- [x] Web Push: chaves VAPID, subscrição, envio RFC 8291/8292 só com WebCrypto (do Wattómetro)
- [x] Cron diário às 09:00 de Lisboa (crons às 8h e 9h UTC; `alert_log` evita repetições): um alerta por agregado com os itens vermelhos/amarelos
- [x] **Ações na notificação:** Comido / Deitado fora / Ainda tenho, tratadas no Service Worker (`public/push-sw.js`) sem abrir a app; mostra o item seguinte
- [x] Nota na UI para iPhone: as notificações exigem a PWA instalada no ecrã principal
- [x] A chave de IA pode ficar guardada na conta, cifrada (AES-GCM com `KEY_ENCRYPTION_SECRET`)
- [ ] Verificar em dois telemóveis reais: despensa partilhada, alerta das 9h e resposta de 1 toque (Android; iPhone quando houver)

**Pronto quando:** dois telemóveis da família veem a mesma despensa e o alerta diário funciona com resposta de 1 toque.

## Fase 4 — Anti-desperdício

- [x] **"O que jantar hoje?"** (`/jantar`): envia os itens vermelhos/amarelos à IA (`/api/ai/recipes`, prompt `recipes.v2`) e devolve 2–3 receitas simples (título, alimentos usados, o que falta, passos curtos, tempo). Nada fica guardado; a sessão guarda a última resposta para não gastar outra vez
- [x] **Lista de compras automática** (`/compras`): `consumido` sugere reposição (na app e no botão da notificação; um toque para aceitar); `deitado_fora` não repõe e mostra "Compraste demais?" na lista e no aviso de anular
- [x] Lista de compras partilhada no agregado, com itens manuais: sincroniza com os alimentos (mesmo cursor); apagar é marcar `removido`, para chegar a todos os telemóveis
- [x] Estatísticas simples (`/desperdicio`): percentagem deitada fora nos últimos 6 meses, deitados fora por mês e tipos mais desperdiçados
- [ ] Verificar no telemóvel, com a família: receitas com a IA gratuita, lista partilhada entre dois telemóveis

## Fase 5 — Admin, robustez e lançamento

- [ ] Painel de admin (emails em `ADMIN_EMAILS`): tamanho da D1, consultas/dia, uso de IA por fornecedor, utilizadores e agregados ativos
- [ ] Aviso ao admin quando os limites do plano gratuito se aproximam (reutilizar a lógica pensada para o Prazómetro)
- [ ] Exportar/apagar dados do utilizador (RGPD)
- [ ] Página "Sobre", licença AGPL-3.0, link para o repositório
- [ ] Testes end-to-end dos fluxos principais
- [ ] Versão 1.0.0, uso em família durante 2–3 semanas, recolha de feedback

## Backlog (depois da 1.0)

- Importar o talão digital das apps dos supermercados, se houver forma viável
- Widget/atalho "Adicionar por voz" no ecrã principal
- Modo "congelei isto" (muda localização e validade)
- Partilhar receitas
- TWA para a Play Store, se fizer sentido

---

## Seed inicial de `shelf_life_rules`

Valores **indicativos** (em dias) para estimar a validade quando não há data impressa. Rever com o uso real; o utilizador ajusta sempre com um toque. Para embalados com data impressa (leite UHT, iogurtes, enlatados), a data impressa tem sempre prioridade.

| Categoria | Localização | Estado | Dias |
|---|---|---|---|
| Carne picada | frigorífico | fechado | 1 |
| Carne fresca (bifes, frango) | frigorífico | fechado | 2 |
| Peixe fresco | frigorífico | fechado | 1 |
| Fiambre / charcutaria fatiada | frigorífico | aberto | 4 |
| Queijo fresco | frigorífico | aberto | 4 |
| Queijo curado | frigorífico | aberto | 21 |
| Leite UHT | despensa | fechado | 90 (usar data impressa) |
| Leite | frigorífico | aberto | 4 |
| Leite fresco pasteurizado | frigorífico | fechado | 5 |
| Iogurtes | frigorífico | fechado | 21 (usar data impressa) |
| Natas | frigorífico | aberto | 4 |
| Ovos | frigorífico | fechado | 21 |
| Pão fresco | despensa | — | 2 |
| Fruta | despensa/frigorífico | — | 5 |
| Legumes / saladas embaladas | frigorífico | fechado | 4 |
| Saladas embaladas | frigorífico | aberto | 1 |
| Sobras cozinhadas | frigorífico | — | 3 |
| Congelados (genérico) | congelador | — | 120 |
| Carne/peixe congelado em casa | congelador | — | 90 |
| Molhos / frascos | frigorífico | aberto | 14 |
| Enlatados / massa / arroz | despensa | fechado | longa duração (fora do semáforo) |
