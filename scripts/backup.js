const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const root = path.resolve(__dirname, '..');

function verifyDatabase(file) {
  const database = new Database(file, { readonly: true, fileMustExist: true });
  try {
    if (database.pragma('integrity_check', { simple: true }) !== 'ok') {
      throw new Error('A verificacao de integridade do SQLite falhou.');
    }
    if (database.pragma('foreign_key_check').length) {
      throw new Error('O backup possui referencias estrangeiras invalidas.');
    }
  } finally {
    database.close();
  }
}

function removeExpiredBackups(directory, retentionDays, now = Date.now()) {
  const oldest = now - retentionDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/^inventory-\d{4}-\d{2}-\d{2}T.+\.db$/.test(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (fs.statSync(file).mtimeMs < oldest) {
      fs.unlinkSync(file);
      removed++;
    }
  }
  return removed;
}

async function createBackup({
  databasePath = process.env.DATABASE_PATH || path.join(root, 'data', 'inventory.db'),
  backupDirectory = process.env.BACKUP_DIR || path.join(root, 'data', 'backups'),
  externalDirectory = process.env.BACKUP_EXTERNAL_DIR,
  retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 30),
  now = new Date()
} = {}) {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error('BACKUP_RETENTION_DAYS deve ser um inteiro maior ou igual a 1.');
  }
  if (!fs.existsSync(databasePath)) {
    throw new Error('Banco ainda nao existe. Inicie o sistema primeiro.');
  }
  fs.mkdirSync(backupDirectory, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const destination = path.join(backupDirectory, `inventory-${stamp}.db`);
  const source = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    // SQLite backup inclui alteracoes presentes no WAL no momento da copia.
    await source.backup(destination);
    verifyDatabase(destination);
    let externalCopy = null;
    if (externalDirectory) {
      fs.mkdirSync(externalDirectory, { recursive: true });
      externalCopy = path.join(externalDirectory, path.basename(destination));
      fs.copyFileSync(destination, externalCopy, fs.constants.COPYFILE_EXCL);
      verifyDatabase(externalCopy);
      removeExpiredBackups(externalDirectory, retentionDays, now.getTime());
    }
    const removed = removeExpiredBackups(backupDirectory, retentionDays, now.getTime());
    return { destination, externalCopy, removed };
  } catch (error) {
    if (fs.existsSync(destination)) fs.unlinkSync(destination);
    throw error;
  } finally {
    source.close();
  }
}

function latestBackup(directory) {
  if (!fs.existsSync(directory)) return null;
  return fs
    .readdirSync(directory)
    .filter((name) => /^inventory-\d{4}-\d{2}-\d{2}T.+\.db$/.test(name))
    .map((name) => path.join(directory, name))
    .sort()
    .at(-1);
}

if (require.main === module) {
  createBackup()
    .then((result) => console.log(JSON.stringify({ event: 'backup_created', ...result })))
    .catch((error) => {
      console.error(JSON.stringify({ event: 'backup_failed', message: error.message }));
      process.exitCode = 1;
    });
}

module.exports = { createBackup, latestBackup, removeExpiredBackups, verifyDatabase };
