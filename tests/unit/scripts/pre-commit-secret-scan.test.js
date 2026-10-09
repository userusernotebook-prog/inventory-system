const test = require('node:test');
const assert = require('node:assert/strict');
const { scanFiles } = require('../../../scripts/pre-commit-secret-scan');

test('bloqueia banco, certificado, chave privada e arquivo de ambiente no commit', () => {
  const findings = scanFiles([
    { path: 'data/inventory.db', content: Buffer.from('SQLite format 3') },
    { path: 'deploy/certs/privkey.pem', content: Buffer.from('not relevant') },
    { path: '.env.production', content: Buffer.from('SECRET=value') },
    {
      path: 'src/fixture.txt',
      content: Buffer.from(['-----BEGIN', ' PRIVATE KEY-----'].join('') + '\nsegredo')
    }
  ]);
  assert.deepEqual(
    findings.map((finding) => finding.path),
    ['data/inventory.db', 'deploy/certs/privkey.pem', '.env.production', 'src/fixture.txt']
  );
});

test('permite somente o modelo de ambiente e arquivos comuns', () => {
  assert.deepEqual(
    scanFiles([
      { path: '.env.example', content: Buffer.from('PORT=3000') },
      { path: 'src/app.js', content: Buffer.from('module.exports = {}') }
    ]),
    []
  );
});
