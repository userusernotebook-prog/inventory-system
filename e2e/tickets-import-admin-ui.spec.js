const { test, expect } = require('@playwright/test');
const { generate } = require('otplib');
const XLSX = require('xlsx');
const path = require('node:path');

const password = 'SenhaDeTesteForte1';
const projectDir = path.resolve(__dirname, '..');

async function login(page, email, totpCode) {
  await page.goto('/#/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  if (totpCode) await page.getByLabel('Codigo 2FA (se habilitado)').fill(totpCode);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

function workbook({ code, invalid = false }) {
  const source = XLSX.readFile(path.join(projectDir, 'public', 'modelo-importacao-inicial.xlsx'));
  const people = source.Sheets.Funcionarios;
  const assets = source.Sheets.Ativos;
  Object.assign(people, {
    A2: { t: 's', v: code }, B2: { t: 's', v: 'Pessoa importada pela interface' }, J2: { t: 's', v: 'Ativo' }, '!ref': 'A1:L2'
  });
  Object.assign(assets, {
    A2: { t: 's', v: '' }, B2: { t: 's', v: 'Notebook' }, F2: { t: 's', v: `SERIAL-${code}` }, G2: { t: 's', v: `REF-${code}` }, O2: { t: 's', v: 'Desativado' }, P2: { t: 's', v: invalid ? '' : 'Sem reparo' }, Q1: { t: 's', v: 'LAUDO TÉCNICO' }, Q2: { t: 's', v: invalid ? '' : 'Laudo técnico de teste.' }, '!ref': 'A1:Q2'
  });
  return XLSX.write(source, { type: 'buffer', bookType: 'xlsx' });
}

test('tecnico abre chamado, vê os equipamentos do funcionário e fecha com parecer', async ({ page }) => {
  await login(page, 'tecnico.e2e@example.test');
  await page.getByRole('link', { name: 'Chamados' }).click();
  await page.getByRole('link', { name: 'Abrir chamado' }).click();
  await page.getByLabel('Funcionário do chamado').selectOption({ label: 'Pessoa Chamados Interface E2E' });
  await expect(page.getByLabel('Equipamento do chamado')).toContainText('ticket-ui-e2e');
  const assetOption = page.getByLabel('Equipamento do chamado').locator('option').filter({ hasText: 'ticket-ui-e2e' });
  await page.getByLabel('Equipamento do chamado').selectOption(await assetOption.getAttribute('value'));
  await page.getByLabel('Descrição').fill('Usuário relata falha de conexão no notebook.');
  await page.getByRole('button', { name: 'Abrir chamado' }).click();
  await expect(page.getByText('Pessoa Chamados Interface E2E')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Fechar chamado' });
  await dialog.getByLabel('Parecer técnico').fill('Adaptador de rede reinstalado e conexão normalizada.');
  await dialog.getByRole('button', { name: 'Confirmar fechamento' }).click();
  await expect(page.getByText('closed', { exact: true })).toBeVisible();
});

test('tecnico pre-valida importacao com erro por linha e confirma uma planilha valida', async ({ page }) => {
  await login(page, 'tecnico.e2e@example.test');
  await page.getByRole('link', { name: 'Importar Excel' }).click();
  const input = page.getByLabel('Planilha Excel');
  await input.setInputFiles({ name: 'invalido.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: workbook({ code: 'UI-INVALIDO', invalid: true }) });
  await page.getByRole('button', { name: 'Pré-validar planilha' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado da pré-validação' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Ativos', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2', exact: true })).toBeVisible();
  await input.setInputFiles({ name: 'valido.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: workbook({ code: `UI-${Date.now()}` }) });
  await page.getByRole('button', { name: 'Pré-validar planilha' }).click();
  await expect(page.getByText('Pronta para importar:')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar importação' }).click();
  await expect(page.getByRole('heading', { name: 'Importação concluída' })).toBeVisible();
});

test('admin consulta auditoria e status do ultimo backup pela interface', async ({ page }) => {
  await login(page, 'admin.e2e@example.test', await generate({ secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' }));
  await page.getByRole('link', { name: 'Administracao' }).click();
  await expect(page.getByRole('heading', { name: 'Administração' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Último backup' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Auditoria' })).toBeVisible();
  await page.getByLabel('Filtrar entidade').fill('ticket');
  await expect(page.getByLabel('Filtrar entidade')).toHaveValue('ticket');
  await expect(page.getByText('close', { exact: true })).toBeVisible();
});

test('perfil Consulta não vê ações de abertura nem importação', async ({ page }) => {
  await login(page, 'consulta.e2e@example.test');
  await page.getByRole('link', { name: 'Chamados' }).click();
  await expect(page.getByRole('link', { name: 'Abrir chamado' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Importar Excel' })).toHaveCount(0);
});
