const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('compose monta o secret TOTP apenas na aplicacao', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../docker-compose.yml'), 'utf8');
  assert.match(source, /TOTP_ENCRYPTION_KEY_FILE: \/run\/secrets\/totp_encryption_key/);
  assert.match(source, /app:[\s\S]*?secrets:[\s\S]*?- totp_encryption_key/);
  assert.doesNotMatch(source.match(/  backup:[\s\S]*?\nvolumes:/)?.[0] || '', /totp_encryption_key/);
  assert.match(source, /totp_encryption_key:[\s\S]*file: \$\{TOTP_ENCRYPTION_KEY_SECRET_FILE:-\.\/secrets\/totp_key\.txt\}/);
});
