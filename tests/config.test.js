const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const configPath = path.resolve(__dirname, '..', 'config.js');

function startWith(overrides) {
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(configPath)})`], {
    env: { ...process.env, ADMIN_PASSWORD: '', PORT: '3000', ...overrides },
    encoding: 'utf8'
  });
}

test('a inicialização rejeita senha ausente ou padrão e porta inválida', () => {
  for (const password of ['', 'admin123']) {
    const result = startWith({ ADMIN_PASSWORD: password });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ADMIN_PASSWORD/);
  }

  const invalidPort = startWith({ ADMIN_PASSWORD: 'senha-de-teste', PORT: 'abc' });
  assert.notEqual(invalidPort.status, 0);
  assert.match(invalidPort.stderr, /PORT/);

  assert.equal(startWith({ ADMIN_PASSWORD: 'senha-de-teste' }).status, 0);
});
