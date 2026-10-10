const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { latestBackup, verifyAgeFile, verifyDatabase } = require('./backup');

// Lê a chave privada age (AGE-SECRET-KEY-...) de um arquivo gerado por age-keygen.
function readIdentity(identityFile) {
  const identity = fs
    .readFileSync(identityFile, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('AGE-SECRET-KEY-'));
  if (!identity) throw new Error('AGE_IDENTITY_FILE não contém uma chave privada age.');
  return identity;
}

async function decryptCopy(backupPath, identityFile, directory) {
  if (!identityFile) {
    throw new Error(
      'Para validar uma cópia .age defina AGE_IDENTITY_FILE com a chave privada age (fora do servidor).'
    );
  }
  verifyAgeFile(backupPath);
  const age = await import('age-encryption');
  const decrypter = new age.Decrypter();
  decrypter.addIdentity(readIdentity(identityFile));
  const decrypted = path.join(directory, 'inventory-decrypted.db');
  fs.writeFileSync(decrypted, await decrypter.decrypt(fs.readFileSync(backupPath)), {
    mode: 0o600
  });
  return decrypted;
}

async function verifyRestore(backupPath, { identityFile = process.env.AGE_IDENTITY_FILE } = {}) {
  if (!backupPath || !fs.existsSync(backupPath)) {
    throw new Error('Nenhum backup encontrado para validar. Execute npm run backup primeiro.');
  }
  const encrypted = backupPath.endsWith('.age');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-restore-check-'));
  try {
    const sqlitePath = encrypted
      ? await decryptCopy(backupPath, identityFile, directory)
      : backupPath;
    const restored = path.join(directory, 'inventory-restored.db');
    const source = new Database(sqlitePath, { readonly: true, fileMustExist: true });
    try {
      await source.backup(restored);
    } finally {
      source.close();
    }
    verifyDatabase(restored);
    return { backupPath, restored: true, encrypted };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (require.main === module) {
  require('../src/config/load-env').loadEnv();
  const backupPath =
    process.argv[2] ||
    latestBackup(process.env.BACKUP_DIR || path.join(__dirname, '..', 'data', 'backups'));
  verifyRestore(backupPath)
    .then((result) => console.log(JSON.stringify({ event: 'backup_restore_verified', ...result })))
    .catch((error) => {
      console.error(
        JSON.stringify({ event: 'backup_restore_verification_failed', message: error.message })
      );
      process.exitCode = 1;
    });
}

module.exports = { verifyRestore };
