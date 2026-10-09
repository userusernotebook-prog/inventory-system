const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createIntegrationContext } = require('../helpers/integration-context');
const { findNonUtcTimestamps } = require('../../src/shared/utils/timestamps');

test('auditor encontra valores de data fora do ISO UTC com Z', () => {
  const context = createIntegrationContext();
  try {
    context.db.prepare("INSERT INTO users(name,email,password_hash,profile_base,created_at,updated_at) VALUES('Data','date@example.test','x','CONSULTA',?,?)").run('2026-10-09 10:00:00', '2026-10-09T10:00:00.000Z');
    assert.deepEqual(findNonUtcTimestamps(context.db), [
      { table: 'users', column: 'created_at', id: 1, value: '2026-10-09 10:00:00' }
    ]);
  } finally { context.close(); }
});

test('dados gerados pela aplicacao usam ISO UTC com Z e migrations novas nao usam CURRENT_TIMESTAMP', () => {
  const context = createIntegrationContext();
  try {
    assert.deepEqual(findNonUtcTimestamps(context.db), []);
  } finally { context.close(); }
  const migrations = path.resolve(__dirname, '../../src/db/migrations');
  for (const file of fs.readdirSync(migrations).filter((name) => Number(name.slice(0, 3)) >= 11)) {
    assert.doesNotMatch(fs.readFileSync(path.join(migrations, file), 'utf8'), /CURRENT_TIMESTAMP/i, file);
  }
});
