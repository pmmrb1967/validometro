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
  await expect(card.getByText('Congelador', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Congelei' })).toHaveCount(0);

  await card.getByRole('button', { name: 'Tirei do congelador' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'fora do congelador' })).toBeVisible();
  await expect(card.getByText('Frigorífico, aberto', { exact: true })).toBeVisible();
  // "Anular" puts it back as it was.
  await page.getByRole('button', { name: 'Anular' }).click();
  await expect(card.getByText('Congelador', { exact: true })).toBeVisible();
});

test('partilhar um talão sem a app instalada explica o que fazer', async ({ page }) => {
  const answer = await page.request.post('/partilhar', { maxRedirects: 0 });
  expect(answer.status()).toBe(303);
  expect(answer.headers().location).toMatch(/\/adicionar\?partilha=sem-app$/);
  await page.goto('/adicionar?partilha=sem-app');
  await expect(page.getByRole('alert')).toContainText('instala a app no ecrã principal');
  await expect(page).toHaveURL('/adicionar');
});
