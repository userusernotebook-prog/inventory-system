const { test, expect } = require('@playwright/test');

const password = 'SenhaDeTesteForte1';
const stamp = Date.now();
const employeeName = `Funcionario CRUD ${stamp}`;
const employeeEmail = `crud-${stamp}@example.test`;
const assetName = `notebook-crud-${stamp}`;

async function login(page, email) {
  await page.goto('/#/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test('RH cadastra funcionario, tecnico cadastra e atribui ativo, consulta apenas visualiza', async ({ page }) => {
  await login(page, 'rh.e2e@example.test');
  await page.getByRole('link', { name: 'Funcionarios' }).click();
  await page.getByRole('link', { name: 'Novo funcionario' }).click();
  await page.getByLabel('Nome').fill(employeeName);
  await page.getByLabel('E-mail').fill(employeeEmail);
  await page.getByLabel('Departamento').fill('Tecnologia');
  await page.getByLabel('Cidade').fill('Sao Paulo');
  await page.getByRole('button', { name: 'Cadastrar funcionario' }).click();
  await expect(page.getByRole('heading', { name: employeeName })).toBeVisible();
  await expect(page.getByText('Sem ativos vinculados.')).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await login(page, 'tecnico.e2e@example.test');
  await page.getByRole('link', { name: 'Ativos' }).click();
  await page.getByRole('link', { name: 'Novo ativo' }).click();
  await page.getByLabel('Tipo de equipamento').fill('Notebook');
  await page.getByLabel('Hostname').fill(assetName);
  await page.getByLabel('Serial').fill(`SERIAL-${stamp}`);
  await page.getByLabel('Cidade').fill('Sao Paulo');
  await page.getByRole('button', { name: 'Cadastrar ativo' }).click();
  await expect(page.getByRole('heading', { name: assetName })).toBeVisible();
  await page.getByRole('button', { name: 'Atribuir a funcionario' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirmar movimentacao' });
  await dialog.getByLabel('Funcionario de destino').selectOption({ label: employeeName });
  await dialog.getByLabel('Motivo').fill('Entrega inicial do equipamento ao funcionario.');
  await dialog.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('EM USO').first()).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await login(page, 'consulta.e2e@example.test');
  await page.getByRole('link', { name: 'Funcionarios' }).click();
  await page.getByLabel('Buscar funcionarios').fill(employeeName);
  await page.getByRole('link', { name: employeeName }).click();
  await expect(page.getByText('Notebook - ' + assetName)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Editar funcionario' })).toHaveCount(0);
  await page.getByRole('link', { name: `Notebook - ${assetName}` }).click();
  await expect(page.getByRole('link', { name: 'Editar ativo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Receber equipamento' })).toHaveCount(0);
  await expect(page.getByText('Nenhuma acao permitida para seu perfil.')).toBeVisible();
});
