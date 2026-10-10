const { test, expect } = require('@playwright/test');

const password = 'SenhaDeTesteForte1';

test('RH ve que funcionario em desligamento esta bloqueado para edicao', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByLabel('E-mail').fill('rh.e2e@example.test');
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.getByRole('link', { name: 'Funcionarios' }).click();
  await page.getByLabel('Buscar funcionarios').fill('Pessoa Bloqueada E2E');
  await page.getByRole('link', { name: 'Pessoa Bloqueada E2E' }).click();

  await expect(page.getByRole('link', { name: 'Editar funcionario' })).toHaveCount(0);
  await expect(
    page.getByText('Funcionário em processo de desligamento: dados bloqueados.')
  ).toBeVisible();
});
