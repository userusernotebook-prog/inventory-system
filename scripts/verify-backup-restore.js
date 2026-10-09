const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { latestBackup, verifyDatabase } = require('./backup');

async function verifyRestore(backupPath) {
  if (!backupPath || !fs.existsSync(backupPath)) {
    throw new Error('Nenhum backup encontrado para validar. Execute npm run backup primeiro.');
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-restore-check-'));
  const restored = path.join(directory, 'inventory-restored.db');
  const source = new Database(backupPath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(restored);
    verifyDatabase(restored);
    return { backupPath, restored: true };
  } finally {
    source.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (require.main === module) {
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
