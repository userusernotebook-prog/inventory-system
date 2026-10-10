const { test, expect } = require('@playwright/test');
const { generate } = require('otplib');

const password = 'SenhaDeTesteForte1';
const employeeName = 'Pessoa Desligamento Interface E2E';

async function login(page, email, totp = '') {
  await page.goto('/#/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  if (totp) await page.getByLabel(/Codigo 2FA/i).fill(totp);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test('RH inicia, tecnico recebe e propoe desativacao, admin aprova e RH conclui pela interface', async ({ page }) => {
  await login(page, 'rh.e2e@example.test');
  await page.getByRole('link', { name: 'Desligamentos' }).click();
  await page.getByText(employeeName).locator('..').getByRole('button', { name: 'Iniciar desligamento' }).click();
  const start = page.getByRole('dialog', { name: 'Iniciar desligamento' });
  await start.getByLabel('Data de desligamento').fill('2026-12-31');
  await start.getByLabel('Motivo').fill('Encerramento de contrato para teste de interface.');
  await start.getByRole('button', { name: 'Confirmar inicio' }).click();
  await expect(page.getByRole('link', { name: 'Abrir checklist' })).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await login(page, 'tecnico.e2e@example.test');
  await page.getByRole('link', { name: 'Desligamentos' }).click();
  await expect(page.getByText('offboard-ui-e2e')).toBeVisible();
  await page.getByRole('row', { name: /offboard-ui-e2e/ }).getByRole('button', { name: 'Receber equipamento' }).click();
  const receive = page.getByRole('dialog', { name: 'Receber equipamento' });
  await receive.getByLabel('Estado fisico').fill('Equipamento com falha de inicializacao.');
  await receive.getByLabel('Acessorios').fill('Carregador original');
  await receive.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await page.getByRole('row', { name: /offboard-ui-e2e/ }).getByRole('button', { name: 'Definir destino' }).click();
  const destination = page.getByRole('dialog', { name: 'Definir destino' });
  await destination.getByLabel('Destino').selectOption('DESATIVADO');
  await destination.getByLabel('Justificativa').fill('Falha de placa sem reparo viavel.');
  await destination.getByLabel('Laudo tecnico').fill('Placa logica comprometida; reparo economicamente inviavel.');
  await destination.getByRole('button', { name: 'Confirmar destino' }).click();
  await expect(page.getByRole('row', { name: /offboard-ui-e2e/ }).getByRole('button', { name: 'Definir destino' })).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await login(page, 'admin.e2e@example.test', await generate({ secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' }));
  await page.getByRole('link', { name: /Aprovacoes/ }).click();
  await page.getByLabel('Filtrar tipo').selectOption('DESATIVACAO_ATIVO');
  await page.getByRole('link', { name: 'Ver' }).first().click();
  await page.getByRole('button', { name: 'Aprovar' }).click();
  const approval = page.getByRole('dialog', { name: 'Aprovar solicitacao' });
  await approval.getByLabel('Motivo').fill('Desativacao aprovada para encerramento.');
  await approval.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('APROVADA').first()).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await login(page, 'rh.e2e@example.test');
  await page.getByRole('link', { name: 'Desligamentos' }).click();
  await page.getByText(employeeName).locator('..').getByRole('link', { name: 'Abrir checklist' }).click();
  await expect(page.getByText('Pendentes de recebimento')).toBeVisible();
  await page.getByRole('button', { name: 'Concluir desligamento' }).click();
  await page.getByRole('link', { name: 'Voltar para desligamentos' }).click();
  await expect(page.getByText(employeeName)).toHaveCount(0);
});

test('tecnico nao ve a acao de iniciar desligamento', async ({ page }) => {
  await login(page, 'tecnico.e2e@example.test');
  await page.getByRole('link', { name: 'Desligamentos' }).click();
  await expect(page.getByRole('button', { name: 'Iniciar desligamento' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Fila tecnica de desligamento' })).toBeVisible();
});
