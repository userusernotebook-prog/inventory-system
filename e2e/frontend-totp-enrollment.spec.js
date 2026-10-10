const { test, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { generate } = require('otplib');

const projectDir = path.resolve(__dirname, '..');
let server;

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:4174/health');
      if (response.ok) return;
    } catch {
      // O processo ainda está preparando o banco de teste.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Servidor isolado de 2FA não iniciou.');
}

test.beforeAll(async () => {
  server = spawn(process.execPath, ['e2e/server.js'], {
    cwd: projectDir,
    env: {
      ...process.env,
      PORT: '4174',
      NODE_ENV: 'test',
      E2E_TOTP_ENROLLMENT: '1',
      TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 12).toString('base64')
    },
    stdio: 'pipe'
  });
  await waitForServer();
});
test.afterAll(() => server?.kill());

test('administrador configura 2FA pela interface', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/#/login');
  await page.getByLabel('E-mail').fill('admin.e2e@example.test');
  await page.getByLabel('Senha').fill('SenhaDeTesteForte1');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /Configure a autentica/ })).toBeVisible();
  await page.getByRole('button', { name: 'Gerar chave 2FA' }).click();
  const secret = await page.locator('p.font-mono').innerText();
  await page.locator('input[name="code"]').fill(await generate({ secret }));
  await page.getByRole('button', { name: 'Confirmar 2FA' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
