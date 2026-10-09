const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const configPath = path.resolve(__dirname, '..', '..', 'config.js');

function startWith(overrides) {
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(configPath)})`], {
    env: { ...process.env, ADMIN_PASSWORD: '', PORT: '3000', ...overrides },
    encoding: 'utf8'
  });
}

test('a inicialização valida a porta e não depende de senha em variável de ambiente', () => {
  const invalidPort = startWith({ PORT: 'abc' });
  assert.notEqual(invalidPort.status, 0);
  assert.match(invalidPort.stderr, /PORT/);

  assert.equal(startWith({ PORT: '3000' }).status, 0);
  const productionWithoutOrigin = startWith({ NODE_ENV: 'production', APP_ORIGIN: '' });
  assert.notEqual(productionWithoutOrigin.status, 0);
  assert.match(productionWithoutOrigin.stderr, /APP_ORIGIN/);
  assert.equal(
    startWith({ NODE_ENV: 'production', APP_ORIGIN: 'https://inventario.example.test' }).status,
    0
  );
});
