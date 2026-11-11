// SPDX-License-Identifier: AGPL-3.0-or-later
// The main flows, in the built app with its API (playwright.config.ts): starting without an
// account, closing the loop with one tap, the account and its sync, the panel and the data.
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'uma palavra-passe longa';

/** A different person for each test and project: they share one database. */
function email(name: string): string {
  return `${name}-${test
    .info()
    .project.name.normalize('NFD')
    .replace(/[^a-z]/g, '')}-${Date.now()}@e2e.test`;
}

async function addItem(page: Page, name: string): Promise<void> {
  await page.goto('/adicionar');
  await page.getByLabel('Nome').fill(name);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText(name)).toBeVisible();
}

async function createAccount(page: Page, address: string): Promise<void> {
  await page.goto('/criar-conta');
  await page.getByLabel('Email').fill(address);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link', { name: 'Definições' })).toBeVisible();
}

test('sem conta: da página inicial ao semáforo, e o que foi comido volta à lista', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Os alimentos lá de casa, por ordem de usar.' }),
  ).toBeVisible();
  // Before starting there is nothing to set: only "Entrar".
  await expect(page.getByRole('link', { name: 'Definições' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Começar sem conta' }).first().click();
  await expect(page.getByRole('heading', { name: 'Ainda não há nada registado' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Definições' })).toBeVisible();

  await addItem(page, 'Natas');
  // Reopening the app goes straight to the traffic light, not to the presentation.
  await page.reload();
  await expect(page.getByText('Natas')).toBeVisible();

  await page.getByRole('button', { name: 'Comido' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Natas' })).toBeVisible();
  // The last one: the list empties, and "Anular" stays at hand.
  await expect(page.getByRole('heading', { name: 'Ainda não há nada registado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anular' })).toBeVisible();

  // Without an account the top bar says so, and the home screen says where the data is.
  const banner = page.getByRole('banner');
  await expect(banner.getByText('sem conta', { exact: true })).toBeVisible();
  await expect(banner.getByRole('link', { name: 'Criar conta' })).toBeVisible();
  await expect(page.getByText('Sem conta: os dados ficam só neste browser.')).toBeVisible();

  // The sections are one tap away, from any screen.
  const tabs = page.getByRole('navigation', { name: 'Secções' });
  await tabs.getByRole('link', { name: 'Compras' }).click();
  await expect(page).toHaveURL('/compras');
  await expect(tabs.getByRole('link', { name: 'Compras' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Acabou. Voltar a comprar?' })).toBeVisible();
  await expect(page.getByText('Natas')).toBeVisible();

  // "Sair" without an account: back to the landing page, even after reopening.
  await page.getByRole('banner').getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('button', { name: 'Começar sem conta' }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Começar sem conta' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Começar sem conta' }).first().click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Ainda não há nada registado' })).toBeVisible();

  // The presentation stays at hand.
  await page.goto('/definicoes');
  await page.getByRole('link', { name: 'Ver a apresentação' }).click();
  await page.getByRole('button', { name: 'Abrir a app' }).first().click();
  await expect(page).toHaveURL('/');
});

test('conta: o que estava no telemóvel passa para a conta, sair leva à página inicial', async ({
  page,
}) => {
  const address = email('conta');
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar sem conta' }).first().click();
  await addItem(page, 'Iogurtes naturais');

  await createAccount(page, address);
  await expect(page.getByText('Iogurtes naturais')).toBeVisible();
  // Signed in: the email under the name, no "admin".
  await expect(page.getByRole('banner').getByText(address)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin: abrir o painel' })).toHaveCount(0);

  // "Sair" is in the top bar, on every screen of the app.
  await page.goto('/compras');
  await page.getByRole('banner').getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Começar sem conta' }).first()).toBeVisible();

  // Back in, the items come from the server.
  await page.getByRole('link', { name: 'Entrar' }).first().click();
  await page.getByLabel('Email').fill(address);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Iogurtes naturais')).toBeVisible();
});

test('entrar: as duas opções cabem numa linha, e o olho mostra a palavra-passe', async ({
  page,
}) => {
  await page.goto('/entrar');
  const password = page.getByLabel('Palavra-passe', { exact: true });
  await password.fill(PASSWORD);
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Mostrar a palavra-passe' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue(PASSWORD);
  await page.getByRole('button', { name: 'Esconder a palavra-passe' }).click();
  await expect(password).toHaveAttribute('type', 'password');
  for (const name of ['Já tenho conta', 'Criar conta']) {
    const box = await page.locator('.account-mode span', { hasText: name }).boundingBox();
    expect(box?.height).toBeLessThanOrEqual(48);
  }
});

test('painel: só para quem administra', async ({ page }) => {
  await createAccount(page, email('pessoa'));
  await page.goto('/admin');
  await expect(page.getByText('Esta página é só para quem administra a app.')).toBeVisible();
  await page.goto('/definicoes');
  await expect(page.getByRole('heading', { name: 'Administração' })).toHaveCount(0);

  await page.getByRole('main').getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('button', { name: 'Começar sem conta' }).first()).toBeVisible();
  // scripts/e2e-server.mjs: ADMIN_EMAILS = admin@e2e.test. Sign up, or in if another
  // project got there first.
  await page.goto('/criar-conta');
  await page.getByLabel('Email').fill('admin@e2e.test');
  await page.getByLabel('Palavra-passe', { exact: true }).fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Criar conta' }).click();
  const exists = page.getByRole('alert').filter({ hasText: 'Já existe uma conta' });
  await expect(page.getByRole('link', { name: 'Definições' }).or(exists)).toBeVisible();
  if (await exists.isVisible()) {
    await page.getByRole('radio', { name: 'Já tenho conta' }).check();
    await page.locator('form').getByRole('button', { name: 'Entrar' }).click();
  }
  await expect(page).toHaveURL('/');
  // "admin" in the top bar opens the panel; Definições too.
  await page.getByRole('link', { name: 'Admin: abrir o painel' }).click();
  await expect(page.getByRole('heading', { name: 'Plano gratuito' })).toBeVisible();
  await page.goto('/definicoes');
  await page.getByRole('link', { name: 'Abrir o painel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Plano gratuito' })).toBeVisible();
  await expect(page.getByText('Tamanho da base D1')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quem usa' })).toBeVisible();
  await page.getByRole('button', { name: 'Verificar limites agora' }).click();
  await expect(page.getByText('Nenhum limite novo ultrapassado.')).toBeVisible();

  // Full tables (big numbers, long names) still fit the phone: no sideways page scroll.
  const days = Array.from({ length: 14 }, (_, i) => `2026-11-${String(14 - i).padStart(2, '0')}`);
  await page.route('**/api/admin/overview', (route) =>
    route.fulfill({
      json: {
        date: '2026-11-14',
        analytics: false,
        analyticsError: null,
        metrics: [{ id: 'users', label: 'Contas', unit: 'count', value: 12 }],
        history: days.flatMap((date) =>
          ['workers_requests', 'd1_rows_read', 'd1_rows_written', 'ai_neurons'].map((metric) => ({
            date,
            metric,
            value: 4_999_999,
          })),
        ),
        ai: ['workers-ai', 'gemini', 'anthropic'].map((provider) => ({
          provider,
          operation: 'receipt',
          calls: 12_345,
          failures: 1_234,
          units: 123_456,
        })),
        alerts: [],
        adminPhones: 1,
      },
    }),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Últimos 14 dias' })).toBeVisible();
  const overflow = await page.evaluate(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(overflow).toBeLessThanOrEqual(0);
  for (const table of await page.locator('.table-wrap').all()) {
    const size = await table.evaluate((el) => ({ content: el.scrollWidth, box: el.clientWidth }));
    expect(size.content, `table ${size.content}px in a ${size.box}px card`).toBeLessThanOrEqual(
      size.box,
    );
  }
});

test('dados: descarregar tudo, e apagar o que está no telemóvel', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar sem conta' }).first().click();
  await addItem(page, 'Queijo fresco');

  await page.goto('/definicoes');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descarregar os meus dados' }).click();
  const file = await (await download).path();
  const data = JSON.parse(await readFile(file, 'utf8')) as { items: { name: string }[] };
  expect(data.items.map((item) => item.name)).toEqual(['Queijo fresco']);

  await page.getByRole('button', { name: 'Apagar os dados deste telemóvel' }).click();
  await page.getByRole('button', { name: 'Apagar tudo' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Começar sem conta' }).first()).toBeVisible();
});

test('a tempo: congelar o frango no fim, e tirá-lo do congelador', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar sem conta' }).first().click();
  // Fresh chicken: two days by the rules, so "Congelei" and "Oferecer" are at hand.
  await addItem(page, 'Peito de frango');
  const card = page.getByRole('listitem').filter({ hasText: 'Peito de frango' });
  await expect(card.getByRole('button', { name: 'Oferecer' })).toBeVisible();
  await card.getByRole('button', { name: 'Congelei' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'no congelador' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Congelador. Mudar de sítio' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Congelei' })).toHaveCount(0);

  await card.getByRole('button', { name: 'Tirei do congelador' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'fora do congelador' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Frigorífico. Mudar de sítio' })).toBeVisible();
  await expect(card).toContainText('Frigorífico ✎, aberto');
  // "Anular" puts it back as it was.
  await page.getByRole('button', { name: 'Anular' }).click();
  await expect(card.getByRole('button', { name: 'Congelador. Mudar de sítio' })).toBeVisible();
});

test('partilhar um talão sem a app instalada explica o que fazer', async ({ page }) => {
  const answer = await page.request.post('/partilhar', { maxRedirects: 0 });
  expect(answer.status()).toBe(303);
  expect(answer.headers().location).toMatch(/\/adicionar\?partilha=sem-app$/);
  await page.goto('/adicionar?partilha=sem-app');
  await expect(page.getByRole('alert')).toContainText('instala a app no ecrã principal');
  await expect(page).toHaveURL('/adicionar');
});

/** A one-page digital receipt, with its text (as the supermarkets' PDFs have). */
function receiptPdf(lines: string[]): Buffer {
  const text = lines.map((line, index) => `BT /F1 10 Tf 20 ${780 - index * 14} Td (${line}) Tj ET`);
  const stream = text.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, index) => {
    const at = pdf.length;
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

test('talão em PDF: o texto vai para a leitura, e a revisão abre', async ({ page }) => {
  let sent: { text?: string; image?: string } | undefined;
  // No AI in the tests: answer as the reader would, and keep what the app sent.
  await page.route('**/api/ingest/receipt', async (route) => {
    sent = route.request().postDataJSON() as typeof sent;
    await route.fulfill({
      json: {
        store: 'Continente',
        date: null,
        drafts: [
          {
            key: 'k1',
            raw: 'IOG NAT 4X125',
            name: 'Iogurte natural',
            category: 'iogurtes',
            location: 'frigorifico',
            quantity: 4,
            unit: 'un',
            perishable: true,
            expires_at: '2026-12-01',
            expiry_source: 'estimada',
            known: false,
            price: 1.29,
          },
        ],
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar sem conta' }).first().click();
  await page.goto('/adicionar');
  await page.getByLabel('Talão em PDF ou imagem').setInputFiles({
    name: 'talao.pdf',
    mimeType: 'application/pdf',
    buffer: receiptPdf(['CONTINENTE MODELO', 'IOG NAT 4X125      1,29', 'ARROZ AGULHA 1KG   1,49']),
  });
  await expect(page).toHaveURL('/rever');
  expect(sent?.image).toBeUndefined();
  expect(sent?.text).toContain('IOG NAT 4X125');
  expect(sent?.text).toContain('ARROZ AGULHA');
  await expect(page.getByLabel('Nome')).toHaveValue('Iogurte natural');
  await expect(page.getByLabel('Preço de Iogurte natural, em euros')).toHaveValue('1,29');
});

/** A small receipt-like picture (a PNG), so the app can make it small like a real photo. */
const PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAA8CAIAAACb22+3AAAANElEQVR4nO3NAQkAAAwDoPVPtliLcQ5awPRIxGKxWCwWi8VisVgsFovFYrFYLBaLxWLxp3gc6fo8nfP3JQAAAABJRU5ErkJggg==',
  'base64',
);

test('talão comprido: várias fotos, lidas como um só talão', async ({ page }) => {
  let sent: { image?: string; images?: string[] } | undefined;
  await page.route('**/api/ingest/receipt', async (route) => {
    sent = route.request().postDataJSON() as typeof sent;
    await route.fulfill({ json: { store: null, date: null, drafts: [] } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar sem conta' }).first().click();
  await page.goto('/adicionar');
  const camera = page.locator('.quick-entry input[type=file][capture]');
  await camera.first().setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PHOTO });
  await expect(page.getByText('Talão: 1 foto.')).toBeVisible();
  // The next part, from the panel's own camera button.
  await page.locator('.receipt-parts input[type=file]').setInputFiles({
    name: 'b.png',
    mimeType: 'image/png',
    buffer: PHOTO,
  });
  await expect(page.getByText('Talão: 2 fotos, lidas como um só talão.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Parte 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Ler talão' }).click();
  await expect(page.getByRole('alert')).toContainText('Não encontrei alimentos');
  expect(sent?.images).toHaveLength(2);
  expect(sent?.image).toBeUndefined();
  // "Recomeçar" leaves only the first button again.
  await page.getByRole('button', { name: 'Recomeçar' }).click();
  await expect(page.getByRole('group', { name: 'Fotos do talão' })).toHaveCount(0);
});

test('despensa: bebi 1 da água, e "está a acabar" põe-na na lista', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar sem conta' }).first().click();
  await page.goto('/adicionar');
  await page.getByLabel('Nome').fill('Água Monchique 5L');
  await page.getByLabel('Quantidade').fill('2');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.getByRole('button', { name: /o stock da despensa/ }).click();
  const card = page.getByRole('listitem').filter({ hasText: 'Água Monchique 5L' });
  await card.getByRole('button', { name: 'Bebi 1' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'fica 1' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Bebi 1' })).toHaveCount(0);

  await card.getByRole('button', { name: 'Está a acabar' }).click();
  await expect(card.getByRole('button', { name: 'Na lista ✓' })).toBeDisabled();
  await page
    .getByRole('navigation', { name: 'Secções' })
    .getByRole('link', { name: 'Compras' })
    .click();
  await expect(page.getByRole('checkbox', { name: /^Água Monchique 5L/ })).toBeVisible();
});

test('primeiro inventário: fotos do frigorífico vão para a revisão', async ({ page }) => {
  let sent: { images?: string[]; location?: string } | undefined;
  await page.route('**/api/ingest/shelf', async (route) => {
    sent = route.request().postDataJSON() as typeof sent;
    await route.fulfill({
      json: {
        store: null,
        date: null,
        drafts: [
          {
            key: 'k1',
            raw: null,
            name: 'Iogurte natural',
            category: 'iogurtes',
            location: 'congelador',
            quantity: 4,
            unit: 'un',
            perishable: true,
            expires_at: '2026-12-01',
            expiry_source: 'estimada',
            known: false,
            price: null,
          },
        ],
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar sem conta' }).first().click();
  await page.getByRole('link', { name: 'Fotografa o frigorífico e a despensa' }).click();
  await expect(page).toHaveURL('/adicionar#inventario');
  const shelf = page.locator('.shelf-entry');
  await shelf.getByRole('radio', { name: 'Congelador' }).check({ force: true });
  await shelf
    .locator('input[type=file]')
    .setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PHOTO });
  await expect(shelf.getByText('Congelador: 1 foto.')).toBeVisible();
  await shelf.getByRole('button', { name: 'Fazer a lista' }).click();
  await expect(page).toHaveURL('/rever');
  expect(sent).toMatchObject({ location: 'congelador' });
  expect(sent?.images).toHaveLength(1);
  await expect(page.getByText('Do que se vê nas fotos.')).toBeVisible();
  await expect(page.getByLabel('Nome')).toHaveValue('Iogurte natural');
});

test('comi uma parte: 400 g das costeletas, e "Anular" repõe o peso', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar sem conta' }).first().click();
  await page.goto('/adicionar');
  await page.getByLabel('Nome').fill('Costeletas de porco');
  await page.getByLabel('Quantidade').fill('1,178');
  await page.getByLabel('Unidade').fill('kg');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page).toHaveURL('/');
  const card = page.getByRole('listitem').filter({ hasText: 'Costeletas de porco' });
  await card.getByRole('button', { name: 'Comi uma parte' }).click();
  await card.getByLabel('Ou quanto comeste').fill('400 g');
  await card.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'sobra ~0,778 kg' })).toBeVisible();
  await expect(card).toContainText('0,778 kg');
  await page.getByRole('button', { name: 'Anular' }).click();
  await expect(card).toContainText('1,178 kg');
});

test('mudar de sítio: a cerveja da despensa para o frigorífico, e "Anular"', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar sem conta' }).first().click();
  await page.goto('/adicionar');
  await page.getByLabel('Nome').fill('Iogurtes naturais');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page).toHaveURL('/');
  const card = page.getByRole('listitem').filter({ hasText: 'Iogurtes naturais' });
  await card.getByRole('button', { name: 'Frigorífico. Mudar de sítio' }).click();
  await card
    .getByRole('group', { name: /Mudar .* para/ })
    .getByRole('button', { name: 'Congelador' })
    .click();
  await expect(page.getByRole('status').filter({ hasText: 'no congelador' })).toContainText(
    'não costuma congelar bem',
  );
  await expect(card.getByRole('button', { name: 'Congelador. Mudar de sítio' })).toBeVisible();
  await page.getByRole('button', { name: 'Anular' }).click();
  await expect(card.getByRole('button', { name: 'Frigorífico. Mudar de sítio' })).toBeVisible();
});

test('receitas: só pede à IA quando se carrega no botão', async ({ page }) => {
  let asked = 0;
  await page.route('**/api/ai/recipes', (route) => {
    asked++;
    return route.fulfill({
      json: {
        recipes: [
          {
            title: 'frango grelhado',
            minutes: 20,
            usa: ['Peito de frango'],
            falta: [],
            steps: ['Grelhar.'],
          },
        ],
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar sem conta' }).first().click();
  await addItem(page, 'Peito de frango');

  await page.goto('/receitas');
  await expect(page.getByRole('button', { name: 'Sugerir receitas' })).toBeVisible();
  expect(asked).toBe(0);
  await page.getByRole('button', { name: 'Sugerir receitas' }).click();
  await expect(page.getByRole('heading', { name: 'Frango grelhado' })).toBeVisible();
  expect(asked).toBe(1);
  // Back again in this session: shown from the session, not asked again.
  await page.goto('/');
  await page.goto('/receitas');
  await expect(page.getByRole('heading', { name: 'Frango grelhado' })).toBeVisible();
  expect(asked).toBe(1);
});

test('no computador, os cartões da mesma linha têm a mesma altura', async ({ page }) => {
  test.skip(test.info().project.name !== 'computador', 'columns only on a computer');
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar sem conta' }).first().click();
  // Both in "Usar já": the chicken has "Congelei" and its note, the lettuce neither.
  await addItem(page, 'Peito de frango');
  await addItem(page, 'Alface');
  const lettuce = page.getByRole('listitem').filter({ hasText: 'Alface' });
  await lettuce.getByRole('button', { name: /Editar data/ }).click();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await lettuce.getByLabel('Nova data').fill(tomorrow);
  await lettuce.getByRole('button', { name: 'Guardar data' }).click();
  const cards = page.locator('.home .items > .item');
  await expect(cards).toHaveCount(2);
  const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
  expect(a?.y).toBe(b?.y);
  expect(a?.height).toBe(b?.height);
  // "Ainda vais a tempo de congelar." always under the buttons, never beside them.
  const chicken = page.getByRole('listitem').filter({ hasText: 'Peito de frango' });
  const freeze = await chicken.getByRole('button', { name: /Congelei/ }).boundingBox();
  const note = await chicken.getByText('Ainda vais a tempo de congelar.').boundingBox();
  expect(note!.y).toBeGreaterThanOrEqual(freeze!.y + freeze!.height);
});

test('regras de validade: o leite fresco cá de casa dura 3 dias', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar sem conta' }).first().click();
  await addItem(page, 'Leite fresco');
  const card = page.getByRole('listitem').filter({ hasText: 'Leite fresco' });
  await expect(card.getByText('5 dias')).toBeVisible();

  await page.goto('/definicoes');
  await page.getByRole('link', { name: 'Ver e mudar as regras' }).click();
  await expect(page.getByRole('heading', { name: 'Regras de validade' })).toBeVisible();
  const closed = page.getByLabel('Leite fresco pasteurizado, fechado, em dias');
  await expect(closed).toHaveValue('5');
  await closed.fill('3');
  await closed.press('Enter');
  // The milk already at home was estimated with 5 days: offered to move it, not moved alone.
  await page.getByRole('button', { name: 'Ajustar a data (−2 dias)' }).click();
  await expect(page.getByText('1 alimento passou a contar com 3 dias.')).toBeVisible();
  await expect(page.getByText('Habitual: fechado 5 dias, aberto 4 dias.')).toBeVisible();

  await page.goto('/');
  await expect(card.getByText('3 dias')).toBeVisible();
  // New milk is estimated with the household's days, and survives a reload.
  await page.reload();
  await page.goto('/adicionar');
  await page.getByLabel('Nome').fill('Leite fresco');
  await expect(page.getByText(/dura 3 dias/)).toBeVisible();

  // "Repor" goes back to the default.
  await page.goto('/definicoes/validades');
  await page.getByRole('button', { name: 'Repor' }).click();
  await expect(closed).toHaveValue('5');
});
