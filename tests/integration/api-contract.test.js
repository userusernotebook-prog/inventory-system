const test = require('node:test');
const assert = require('node:assert/strict');
const { createIntegrationContext, createUser, login } = require('../helpers/integration-context');

test('a API libera rotas privadas somente depois de uma sessao autenticada', async () => {
  const context = createIntegrationContext();
  try {
    assert.equal((await context.agent.get('/api/assets')).status, 401);
    assert.equal((await context.agent.post('/api/auth/login')).status, 400);

    const user = await createUser(context.db, {
      name: 'Consulta',
      email: 'consulta@example.test'
    });
    const loggedIn = await login(context.agent, user.email, user.password);
    assert.equal(loggedIn.status, 200);
    assert.equal((await context.agent.get('/api/assets')).status, 200);
    assert.equal((await context.agent.post('/api/assets')).status, 403);
  } finally {
    context.close();
  }
});
