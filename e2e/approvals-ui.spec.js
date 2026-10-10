const { test, expect } = require('@playwright/test');
const { generate } = require('otplib');

async function login(page, email, password, totp = '') {
  await page.goto('/#/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  if (totp) await page.getByLabel(/Codigo 2FA/i).fill(totp);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('tecnico solicita uso de backup e admin aprova pela interface', async ({ page }) => {
  await login(page, 'tecnico.e2e@example.test', 'SenhaDeTesteForte1');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.getByRole('link', { name: 'Minhas solicitacoes' }).click();
  await page.getByRole('link', { name: 'Nova solicitacao' }).click();
  await page.getByLabel('Tipo').selectOption('USO_EQUIPAMENTO_BACKUP');
  await page.getByLabel('Funcionario').selectOption({ label: 'Pessoa Aprovacao E2E' });
  const backupOption = page
    .getByLabel('Ativo em backup')
    .locator('option')
    .filter({ hasText: 'backup-approval-e2e' });
  await page.getByLabel('Ativo em backup').selectOption(await backupOption.getAttribute('value'));
  await page.getByLabel('Justificativa').fill('Equipamento adicional aprovado para a pessoa solicitante.');
  await page.getByRole('button', { name: 'Criar solicitacao' }).click();
  await expect(page.getByRole('heading', { name: 'Uso de equipamento em backup' })).toBeVisible();
  await expect(page.getByText('PENDENTE')).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
  await login(
    page,
    'admin.e2e@example.test',
    'SenhaDeTesteForte1',
    await generate({ secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' })
  );
  await expect(page.getByRole('link', { name: /Aprovacoes/ })).toBeVisible();
  await page.getByRole('link', { name: /Aprovacoes/ }).click();
  await page.getByLabel('Filtrar tipo').selectOption('USO_EQUIPAMENTO_BACKUP');
  await page.getByRole('link', { name: 'Ver' }).first().click();
  await page.getByRole('button', { name: 'Aprovar' }).click();
  const modal = page.getByRole('dialog', { name: 'Aprovar solicitacao' });
  await modal.getByLabel('Motivo').fill('Aprovacao administrativa do equipamento em backup.');
  await modal.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('APROVADA').first()).toBeVisible();
  await expect(page.getByText('EM_USO').first()).toBeVisible();
});
