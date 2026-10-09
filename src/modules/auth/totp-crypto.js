const crypto = require('node:crypto');

function encryptionKey(value) {
  if (!value) throw new Error('TOTP_ENCRYPTION_KEY e obrigatoria.');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('TOTP_ENCRYPTION_KEY deve ter exatamente 32 bytes em base64.');
  return key;
}

function encryptTotpSecret(secret, keyValue) {
  const key = encryptionKey(keyValue);
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${nonce.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

function decryptTotpSecret(value, keyValue) {
  if (!value || !value.startsWith('v1:')) return value;
  const [, nonceValue, tagValue, encryptedValue] = value.split(':');
  if (!nonceValue || !tagValue || !encryptedValue) throw new Error('Segredo TOTP cifrado em formato invalido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(keyValue), Buffer.from(nonceValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

function migrateTotpSecrets(db, keyValue) {
  if (!keyValue) return 0;
  const rows = db
    .prepare("SELECT id,totp_secret FROM users WHERE totp_secret IS NOT NULL AND totp_secret NOT LIKE 'v1:%'")
    .all();
  const update = db.prepare('UPDATE users SET totp_secret=?,updated_at=? WHERE id=?');
  const now = new Date().toISOString();
  db.transaction(() => {
    for (const row of rows) update.run(encryptTotpSecret(row.totp_secret, keyValue), now, row.id);
  })();
  return rows.length;
}

module.exports = { decryptTotpSecret, encryptTotpSecret, encryptionKey, migrateTotpSecrets };
