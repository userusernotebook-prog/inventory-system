const { test, expect } = require('@playwright/test');
const { generate } = require('otplib');

const adminPassword = 'SenhaDeTesteForte1';
const technicianPassword = 'SenhaTecnicoProvisoria1';
const technicianEmail = 'tecnico.negado.e2e@example.test';

async function loginAdmin(page) {
  await page.goto('/#/login');
  await page.getByLabel('E-mail').fill('admin.e2e@example.test');
  await page.getByLabel('Senha').fill(adminPassword);
  await page
    .getByLabel(/Codigo 2FA/i)
    .fill(await generate({ secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' }));
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test('admin cria tecnico, nega permissao e o tecnico nao ve a acao pela interface', async ({
  page
}) => {
  await loginAdmin(page);
  await page.getByRole('link', { name: 'Usuarios' }).click();
  await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();
  await page.getByRole('link', { name: 'Cadastrar usuario' }).click();
  await page.getByLabel('Nome').fill('Tecnico com ativos negados');
  await page.getByLabel('E-mail').fill(technicianEmail);
  await page.getByLabel('Perfil').selectOption('TECNICO');
  await page.getByLabel('Senha provisoria').fill(technicianPassword);
  await page.getByRole('button', { name: 'Criar usuario' }).click();
  await expect(page.getByRole('heading', { name: 'Tecnico com ativos negados' })).toBeVisible();

  await page.getByLabel('Permissao asset:read').selectOption('deny');
  await page.getByRole('button', { name: 'Salvar permissoes' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Salvar permissoes individuais' });
  await confirmation.getByLabel('Motivo').fill('Restringir consulta de ativos durante treinamento.');
  await confirmation.getByRole('button', { name: 'Confirmar' }).click();
  await expect(confirmation).toHaveCount(0);

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
  await page.getByLabel('E-mail').fill(technicianEmail);
  await page.getByLabel('Senha').fill(technicianPassword);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Defina sua senha pessoal' })).toBeVisible();
  await page.getByLabel('Nova senha', { exact: true }).fill('SenhaTecnicoDefinitiva2');
  await page.getByLabel('Confirmar nova senha').fill('SenhaTecnicoDefinitiva2');
  await page.getByRole('button', { name: 'Salvar senha' }).click();
  await expect(page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible();
  await page.goto('/#/employees');
  await expect(page.getByRole('heading', { name: /Funcion/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ativos' })).toHaveCount(0);
  await page.goto('/#/assets');
  await expect(page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible();
});
