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

- [x] Página inicial para quem chega pela primeira vez (sem conta e sem nada registado), como nos irmãos; "Entrar" na barra de topo; páginas `/entrar`, `/criar-conta` e `/privacidade`. Quem já usa a app vai direto ao semáforo
- [x] Painel de admin (emails em `ADMIN_EMAILS`): tamanho da D1, consultas/dia, uso de IA por fornecedor, utilizadores e agregados ativos (`/admin`; pedidos e linhas da D1 precisam do token `CF_ANALYTICS_TOKEN`)
- [x] Aviso ao admin quando os limites do plano gratuito se aproximam (lógica do Prazómetro; Cron de hora a hora, push aos 70% e 90%)
- [x] Exportar/apagar dados do utilizador (RGPD): ficheiro JSON em Definições, com e sem conta; apagar a conta ou os dados do telemóvel
- [x] Página "Sobre" (`/sobre`, a apresentação), licença AGPL-3.0 e link para o repositório no rodapé
- [x] Testes end-to-end dos fluxos principais (Playwright, telemóvel e computador, na CI)
- [ ] Versão 1.0.0, uso em família durante 2–3 semanas, recolha de feedback

## Fase 6 — Diferenciação (0.8.0)

O que nenhuma das apps concorrentes faz junto: distinguir os dois tipos de data, salvar a tempo e contar o desperdício em euros.

- [x] **"Consumir até" ≠ "de preferência"** (`src/domain/date-kind.ts`): a foto da data lê o tipo; o utilizador escolhe-o ao adicionar ou ao editar a data; sem indicação, vale o habitual da categoria. Depois de uma data "de preferência": "olha, cheira, prova" em vez de alarme (cartão e alerta das 9h); depois de "consumir até": "não arrisques". Aberto conta sempre como "consumir até"
- [x] **Desperdício em euros**: preço por linha lido do talão (prompt `receipt.v3`), editável na revisão; campo opcional ao adicionar; "Em dinheiro" em `/desperdicio` (conta só o que tem preço)
- [x] **"Congelei"** (`src/domain/freeze.ts`): na última semana, para carne, peixe, pão, sobras, fiambre, leite fresco e fruta; passa para o congelador com 90 dias. "Tirei do congelador" volta ao frigorífico com a regra de aberto. Ambos com "Anular"
- [x] **"Oferecer"**: mensagem pronta para o WhatsApp/SMS (folha de partilha do telemóvel), na última semana e nunca depois de um "consumir até"
- [x] **Partilhar o talão com a app** (Web Share Target, Android com a PWA instalada): a imagem ou captura do talão digital vai direta para a leitura e revisão; fica só na cache do telemóvel até ser lida
- [x] **Talão em ficheiro** (0.8.1): PDF do talão digital ou imagem da galeria. O PDF é lido no telemóvel (pdf.js, carregado só quando é preciso): com texto, vai só o texto (prompt `receipt-text.v1`, funciona com a IA gratuita); digitalizado, vai a 1.ª página como imagem. Também se pode partilhar um PDF com a app
- [x] **Talão comprido em várias fotos** (0.8.2): como as páginas no Faturómetro, as fotos juntam-se (até 4, de cima para baixo) e vão num só pedido, lidas como um só talão; a IA desconta as linhas repetidas entre partes. Também várias capturas escolhidas da galeria
- [ ] Verificar com um talão comprido real em 2–3 fotos (sobretudo com o Workers AI, que nunca foi testado com várias imagens)
- [x] **Portas desenhadas e "Sem data, confirma"** (0.15.0): no desenho da cozinha, cada porta é uma aresta com pega (do lado no combinado, ao centro no americano, na tampa da arca), sem texto; o que vivia na porta vai para as prateleiras pela urgência. Um alimento sem data e de tipo desconhecido já não se esconde com o stock: aparece em "Sem data, confirma", com "Que tipo é?" (a estimativa vem da regra desse tipo, desde o dia da compra) e as respostas de um perecível
- [x] **Receitas com o stock da despensa** (0.14.0): além do que acaba primeiro, a IA recebe o stock de longa duração registado ("também há em casa", sem obrigação de o usar) e continua a assumir o básico (sal, azeite, alho, cebola, arroz, massa, farinha), para que falte menos. No ecrã de revisão do talão, "Marcar todos" junta num toque a longa duração da compra ao stock. Prompt `recipes.v4`
- [x] **Cozinha desenhada** (0.13.0): em Alimentos, "Lista | Cozinha". O frigorífico, o congelador e a despensa desenhados (sem imagens, sem IA), cada alimento com o seu ícone num anel da cor do semáforo: o que acaba primeiro na prateleira de cima, lacticínios e bebidas na porta, legumes na gaveta, o stock no fundo da despensa. Tocar abre o cartão de sempre. Em Definições → "A tua cozinha", o tipo (combinado com congelador em baixo ou em cima, americano, frigorífico e arca, só frigorífico), guardado neste telemóvel
- [x] **Receitas guardadas** (0.12.0): cada sugestão fica guardada com os alimentos para que foi pedida (IndexedDB; com conta, partilhadas pela casa na sincronização, D1 `recipes`, migração 0011). Em "Receitas": "Para o que tens agora", "Guardadas" (☆) e "Anteriores" (30 dias). No cartão do alimento, "2 receitas" abre as dele. "Fiz esta" pergunta o que acabou e marca-o como comido
- [x] **Regras de validade** (0.11.0): em Definições → "Ver e mudar as regras", os dias de cada tipo de alimento por sítio, fechado e aberto; cada casa pode mudá-los (D1 `shelf_life_overrides`, migração 0010, vêm com cada sincronização; sem conta, só no telemóvel). As estimativas novas usam-nos (também na revisão do talão); os alimentos já registados com data estimada por essa regra podem ser ajustados pela diferença ("Ajustar as datas (−2 dias)"). "Repor" volta ao habitual
- [x] **Quanto custa a IA** (0.10.0): junto a cada botão de IA, a estimativa do pedido ("IA gratuita: ≈ 45 neurons por talão; hoje restam 9 860 de 10 000" ou "Na tua chave (Claude Opus 5.5): ≈ 0,04 US$"), pela média dos últimos 30 dias; carregar no botão é aceitar. `ai_usage` guarda o modelo e os tokens de entrada e saída (migração 0009); o painel mostra o custo por fornecedor e modelo, as Definições o gasto da própria chave em 30 dias (`src/domain/ai-cost.ts`, `src/worker/ai-costs.ts`). As receitas só são pedidas com "Sugerir receitas" (0.9.5)
- [x] **Mudar de sítio** (0.9.3): tocar no sítio do cartão ("Despensa ✎") e escolher outro; a data impressa ou escrita fica, a estimada refaz-se com a regra do novo sítio; para o congelador é "Congelei" (com aviso se não congela bem), para fora dele uma data curta a partir de hoje (`src/domain/move.ts`)
- [x] **Comi uma parte** (0.9.1): nos produtos a peso ou volume, "Metade", "Um pouco" ou quanto ("400 g", "0,4 kg"); o peso e o preço passam a ser os do que sobra, para o desperdício contar só o resto
- [x] **Stock da despensa** (0.8.8): os de longa duração que a casa guardou no último ano vêm marcados nos talões seguintes; no cartão, "Está a acabar" (vai para a lista e fica em casa) e "Acabou" (sai e vai para a lista); "Comi 1"/"Bebi 1" para várias unidades, com "Juntar à lista" quando fica 1; "Bebido" em vez de "Comido" para leite, água, sumos e cerveja
- [x] **Lista de compras que poupa**: "Ainda tens X em casa, até …" e "Deitaste fora 2 das últimas 3 vezes: compra menos, ou a embalagem pequena"
- [x] Página inicial: "Os alimentos lá de casa, por ordem de usar." (frigorífico, congelador e despensa) e os novos pontos
- [ ] Verificar com talões reais se o preço por linha é bem lido (Workers AI e Gemini), junto com o teste de 10–15 talões. Feito 1: PDF do Pingo Doce (10/11/2026) com Workers AI, 17/17 produtos e todos os preços certos, descontos incluídos (soma bate com o total pago)
- [ ] Verificar no Android a partilha a partir das apps Continente, Pingo Doce e Lidl Plus
- [ ] **Alertas de recolha de produtos** (ASAE/DGAV/RASFF cruzados com os códigos de barras de casa). Em pausa: não se encontrou um feed ou API estruturado (a ASAE publica avisos em texto; o portal RASFF para consumidores não tem API pública documentada). Retomar se aparecer uma fonte estável; ler o HTML dos avisos seria frágil

## Backlog (depois da 1.0)

- **Seletor PT/EN** (data a decidir). Até lá, passar os textos para `src/app/i18n/pt-PT.ts` à medida que se mexe nos ecrãs. Alvo possível: estrangeiros a viver em Portugal (talões e rótulos portugueses explicados em inglês). Implica prompts, categorias, emails e privacidade em inglês
- **Talão por email** (reencaminhar o email ou PDF do talão digital para um endereço da casa): o Cloudflare Email Routing é gratuito mas exige um domínio próprio na Cloudflare (custo anual), a decidir antes. Talões em PDF precisam também de leitura de PDF (Gemini e Claude leem; Workers AI não)
- **Foto do frigorífico/despensa para fazer o inventário** (avaliação em baixo)
- Widget/atalho "Adicionar por voz" no ecrã principal
- Partilhar receitas
- TWA para a Play Store, se fizer sentido

Feito na 0.9.0: "Primeiro inventário" no fim de Adicionar (e atalho no ecrã vazio), até 4 fotos de um sítio, prompt `shelf.v1`, rota `/api/ingest/shelf`, datas estimadas a partir de hoje ou lidas na foto (`src/domain/shelf.ts`). Falta testar com fotos reais nos três fornecedores.

### Avaliação: inventário a partir de uma foto do interior do frigorífico ou da despensa

- **Possível tecnicamente**, com o mesmo pipeline (foto reduzida no cliente → IA de visão → `DraftItem[]` → ecrã de revisão), um prompt novo `shelf.v1` e o esquema das linhas sem `raw`. A foto não é guardada.
- **Limites reais:** a IA vê embalagens, não validades (a data raramente está virada para a câmara), por isso tudo ficaria com data estimada a partir de hoje, o que está errado para o que já está em casa há dias. Produtos atrás de outros, em gavetas, em caixas ou de marca branca parecida não aparecem ou saem trocados; contar unidades é pouco fiável. Gemini e Claude fazem isto razoavelmente; o modelo gratuito do Workers AI deve falhar mais.
- **Onde vale a pena:** (1) **o primeiro inventário**, quando se começa a usar a app com a casa já cheia (é aí que registar à mão custa); (2) **"o que ainda tenho?"**: comparar a foto com a lista ativa e propor marcar como comido o que já não se vê. Não como forma diária de registar: o talão é melhor.
- **Proposta:** "Fotografar o frigorífico" no primeiro uso e em Adicionar, com o aviso "confirma as datas"; na revisão, a data vem "estimada desde hoje" e a pessoa ajusta. Custo: 1 chamada de visão por foto (cabe na quota gratuita). Esforço: cerca de 1 dia, mais testes com fotos reais de 3–4 frigoríficos antes de decidir se fica.

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
| Mercearia (massa, arroz, enlatados, farinha) | despensa | fechado | longa duração (fora do semáforo) |
| Bebidas (água, sumos, cerveja, vinho) | despensa | fechado | longa duração (fora do semáforo) |
| Doces e snacks (chocolate, bolachas) | despensa | fechado | longa duração (fora do semáforo) |
