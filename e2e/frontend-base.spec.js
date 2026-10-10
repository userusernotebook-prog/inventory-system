const { test, expect } = require('@playwright/test');
const { generate } = require('otplib');

const password = 'SenhaDeTesteForte1';

test('admin faz login com 2FA, ve menu permitido e encerra a sessao pela interface', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByLabel('E-mail').fill('admin.e2e@example.test');
  await page.getByLabel('Senha').fill(password);
  await page.getByLabel(/Codigo 2FA/i).fill(
    await generate({ secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' })
  );
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ativos' })).toBeVisible();
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
});

test('usuario com senha provisoria troca a senha pela interface', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByLabel('E-mail').fill('provisoria.e2e@example.test');
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Defina sua senha pessoal' })).toBeVisible();
  await page.getByLabel('Nova senha', { exact: true }).fill('NovaSenhaPessoal2');
  await page.getByLabel('Confirmar nova senha').fill('NovaSenhaPessoal2');
  await page.getByRole('button', { name: 'Salvar senha' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('perfil sem asset:read nao ve a acao e recebe pagina 403 pela interface', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByLabel('E-mail').fill('sem-ativos.e2e@example.test');
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: 'Ativos' })).toHaveCount(0);
  await page.goto('/#/assets');
  await expect(page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible();
});
