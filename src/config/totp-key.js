const fs = require('node:fs');

const KEY_BYTES = 32;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function readKeyFile(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch (error) {
    throw new Error(
      `Não foi possível ler TOTP_ENCRYPTION_KEY_FILE (${file}): ${error.code || error.message}.`,
      { cause: error }
    );
  }
}

// Única fonte da chave do 2FA para a aplicação e os scripts. A chave vem de
// TOTP_ENCRYPTION_KEY ou do arquivo em TOTP_ENCRYPTION_KEY_FILE (secret do
// Docker); as duas juntas são recusadas para não haver prioridade silenciosa.
function resolveTotpEncryptionKey(environment = process.env) {
  const inline = String(environment.TOTP_ENCRYPTION_KEY || '').trim();
  const file = String(environment.TOTP_ENCRYPTION_KEY_FILE || '').trim();
  if (inline && file) {
    throw new Error('Defina TOTP_ENCRYPTION_KEY ou TOTP_ENCRYPTION_KEY_FILE, não as duas.');
  }
  if (!inline && !file) {
    throw new Error('TOTP_ENCRYPTION_KEY ou TOTP_ENCRYPTION_KEY_FILE é obrigatória.');
  }
  const value = inline || readKeyFile(file);
  if (!BASE64.test(value) || Buffer.from(value, 'base64').length !== KEY_BYTES) {
    throw new Error('TOTP_ENCRYPTION_KEY deve conter 32 bytes aleatórios codificados em base64.');
  }
  return value;
}

module.exports = { resolveTotpEncryptionKey };
