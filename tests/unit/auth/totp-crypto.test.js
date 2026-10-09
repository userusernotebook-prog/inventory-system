const test = require('node:test');
const assert = require('node:assert/strict');
const { encryptTotpSecret, decryptTotpSecret } = require('../../../src/modules/auth/totp-crypto');

test('cifra segredo TOTP com AES-256-GCM e nonce unico', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const first = encryptTotpSecret('JBSWY3DPEHPK3PXPJ', key);
  const second = encryptTotpSecret('JBSWY3DPEHPK3PXPJ', key);
  assert.notEqual(first, second);
  assert.equal(first.startsWith('v1:'), true);
  assert.equal(decryptTotpSecret(first, key), 'JBSWY3DPEHPK3PXPJ');
});

test('recusa chave ausente ou invalida e mantem compatibilidade de leitura para migracao', () => {
  assert.throws(() => encryptTotpSecret('segredo', ''), /TOTP_ENCRYPTION_KEY/);
  assert.throws(() => encryptTotpSecret('segredo', 'curta'), /32 bytes/);
  assert.equal(decryptTotpSecret('JBSWY3DPEHPK3PXPJ', Buffer.alloc(32, 1).toString('base64')), 'JBSWY3DPEHPK3PXPJ');
});
