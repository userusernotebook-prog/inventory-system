const test = require('node:test');
const assert = require('node:assert/strict');
const { createIntegrationContext, createUser } = require('../helpers/integration-context');

test('limite de login usa IP e e-mail quando a aplicacao esta atras do proxy', async () => {
  const context = createIntegrationContext();
  try {
    await createUser(context.db, {
      email: 'rate-limit@example.test',
      password: 'SenhaDeTesteForte1'
    });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await context.agent
        .post('/api/auth/login')
        .set('X-Forwarded-For', '203.0.113.10')
        .send({ email: 'rate-limit@example.test', password: 'senha-incorreta' });
      assert.equal(response.status, 401);
    }
    const blocked = await context.agent
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.10')
      .send({ email: 'rate-limit@example.test', password: 'senha-incorreta' });
    assert.equal(blocked.status, 429);

    const otherIp = await context.agent
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.11')
      .send({ email: 'rate-limit@example.test', password: 'senha-incorreta' });
    assert.equal(otherIp.status, 401, JSON.stringify(otherIp.body));
  } finally {
    context.close();
  }
});
