# Validómetro

PWA gratuita para controlar as validades dos alimentos lá de casa e reduzir o desperdício. Registar uma compra deve levar segundos (foto do talão, código de barras ou voz) e marcar o que foi gasto, um toque.

> Em desenvolvimento. Ver o plano por fases em [`planning/plan.md`](planning/plan.md).

## Stack

Cloudflare Workers (plano gratuito) com Hono e TypeScript, D1 (SQLite) e uma PWA servida pelo próprio Worker. Mais detalhes em [`CLAUDE.md`](CLAUDE.md).

## Desenvolvimento

Requer Node 24 e pnpm (`corepack enable pnpm`).

```bash
pnpm install
pnpm db:migrate:local      # cria a D1 local e aplica as migrações
pnpm dev:worker            # build + wrangler dev (API e PWA em http://localhost:8787)
pnpm dev                   # alternativa: Vite com hot reload; /api vai para o wrangler dev
pnpm test                  # Vitest dentro do workerd, com D1 local
pnpm build && pnpm test:e2e  # Playwright: os fluxos principais, com API e D1 local vazia
pnpm typecheck && pnpm lint
```

## Primeiro deploy (uma vez)

```bash
pnpm exec wrangler login
CLOUDFLARE_ACCOUNT_ID=<conta> pnpm exec wrangler d1 create validometro --jurisdiction eu
# copiar o database_id para wrangler.toml e definir account_id
pnpm db:migrate:remote
pnpm run deploy            # https://app.validometro.workers.dev
```

## Licença

Copyright (C) 2026 Paulo Barbosa. Distribuído sob a [GNU Affero General Public License v3.0](LICENSE) ou posterior.
