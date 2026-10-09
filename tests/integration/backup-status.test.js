const test = require('node:test');
const assert = require('node:assert/strict');
const { generate } = require('otplib');
const { createIntegrationContext, createUser, login } = require('../helpers/integration-context');

const password = 'SenhaDeTesteForte1';
const totpSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

test('somente administrador consulta o ultimo backup bem-sucedido', async () => {
  const context = createIntegrationContext();
  try {
    const admin = await createUser(context.db, {
      name: 'Administrador de backup',
      email: 'backup-admin@example.test',
      password,
      profile: 'ADMIN'
    });
    context.db
      .prepare('UPDATE users SET totp_secret=?,totp_enabled=1 WHERE id=?')
      .run(totpSecret, admin.id);
    const signedIn = await login(
      context.agent,
      admin.email,
      password,
      await generate({ secret: totpSecret })
    );
    assert.equal(signedIn.status, 200);

    const response = await context.agent.get('/api/admin/backup-status');
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(response.body, { latestSuccessful: null, lastAttempt: null });
  } finally {
    context.close();
  }
});
