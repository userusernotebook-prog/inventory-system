const test = require('node:test');
const assert = require('node:assert/strict');
const { createIntegrationContext } = require('../helpers/integration-context');

test('healthcheck da aplicacao confirma acesso ao banco sem exigir sessao', async () => {
  const context = createIntegrationContext();
  try {
    const response = await context.agent.get('/health');
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(response.body, { status: 'ok' });
  } finally {
    context.close();
  }
});
