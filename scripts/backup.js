const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const root = path.resolve(__dirname, '..');

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function backupStatusPath(backupDirectory) {
  return path.join(backupDirectory, 'backup-status.json');
}

function writeBackupStatus(backupDirectory, status) {
  fs.mkdirSync(backupDirectory, { recursive: true });
  const file = backupStatusPath(backupDirectory);
  const temporaryFile = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(status)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporaryFile, file);
}

function errorCode(error) {
  if (error && error.code === 'DATABASE_NOT_FOUND') return error.code;
  if (error && error.code === 'MONITORING_PING_FAILED') return error.code;
  if (error && error.code === 'EXTERNAL_ENCRYPTION_NOT_CONFIGURED') return error.code;
  return 'BACKUP_FAILED';
}

function createDatabaseNotFoundError(databasePath) {
  const error = new Error(`Banco ainda nao existe: ${databasePath}`);
  error.code = 'DATABASE_NOT_FOUND';
  return error;
}

async function waitForDatabase({
  databasePath,
  retryMs = 30_000,
  exists = fs.existsSync,
  sleep = delay
}) {
  if (!Number.isInteger(retryMs) || retryMs < 30_000 || retryMs > 60_000) {
    throw new Error('O intervalo de espera do banco deve estar entre 30000 e 60000 ms.');
  }
  while (!exists(databasePath)) {
    await sleep(retryMs);
  }
}

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
    if (!entry.isFile() || !/^inventory-\d{4}-\d{2}-\d{2}T.+\.(db|db\.age)$/.test(entry.name)) {
      continue;
    }
    const file = path.join(directory, entry.name);
    if (fs.statSync(file).mtimeMs < oldest) {
      fs.unlinkSync(file);
      removed += 1;
    }
  }
  return removed;
}

async function encryptExternalCopy(sourceFile, externalDirectory, recipient) {
  if (!recipient) {
    const error = new Error('AGE_RECIPIENT e obrigatorio quando BACKUP_EXTERNAL_DIR estiver definido.');
    error.code = 'EXTERNAL_ENCRYPTION_NOT_CONFIGURED';
    throw error;
  }
  const age = await import('age-encryption');
  fs.mkdirSync(externalDirectory, { recursive: true });
  const destination = path.join(externalDirectory, `${path.basename(sourceFile)}.age`);
  const encrypter = new age.Encrypter();
  encrypter.addRecipient(recipient);
  const encrypted = await encrypter.encrypt(fs.readFileSync(sourceFile));
  fs.writeFileSync(destination, encrypted, { flag: 'wx', mode: 0o600 });
  return destination;
}

async function sendMonitoringPing(monitorUrl, fetchImpl = global.fetch) {
  if (!monitorUrl) return;
  if (typeof fetchImpl !== 'function') {
    const error = new Error('Fetch nao esta disponivel para enviar o ping de monitoramento.');
    error.code = 'MONITORING_PING_FAILED';
    throw error;
  }
  const response = await fetchImpl(monitorUrl, { method: 'GET', redirect: 'error' });
  if (!response.ok) {
    const error = new Error(`O ping de monitoramento falhou com HTTP ${response.status}.`);
    error.code = 'MONITORING_PING_FAILED';
    throw error;
  }
}

async function createBackup({
  databasePath = process.env.DATABASE_PATH || path.join(root, 'data', 'inventory.db'),
  backupDirectory = process.env.BACKUP_DIR || path.join(root, 'data', 'backups'),
  externalDirectory = process.env.BACKUP_EXTERNAL_DIR,
  ageRecipient = process.env.AGE_RECIPIENT,
  monitorUrl = process.env.BACKUP_MONITOR_URL,
  fetchImpl = global.fetch,
  retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 30),
  now = new Date()
} = {}) {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error('BACKUP_RETENTION_DAYS deve ser um inteiro maior ou igual a 1.');
  }
  if (!fs.existsSync(databasePath)) {
    const error = createDatabaseNotFoundError(databasePath);
    writeBackupStatus(backupDirectory, {
      finishedAt: now.toISOString(),
      success: false,
      sizeBytes: 0,
      errorCode: error.code
    });
    throw error;
  }

  fs.mkdirSync(backupDirectory, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const destination = path.join(backupDirectory, `inventory-${stamp}.db`);
  const source = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(destination);
    verifyDatabase(destination);
    const sizeBytes = fs.statSync(destination).size;
    let externalCopy = null;
    if (externalDirectory) {
      externalCopy = await encryptExternalCopy(destination, externalDirectory, ageRecipient);
      removeExpiredBackups(externalDirectory, retentionDays, now.getTime());
    }
    const removed = removeExpiredBackups(backupDirectory, retentionDays, now.getTime());
    await sendMonitoringPing(monitorUrl, fetchImpl);
    const result = { destination, externalCopy, removed, sizeBytes };
    writeBackupStatus(backupDirectory, {
      finishedAt: now.toISOString(),
      success: true,
      sizeBytes,
      destination: path.basename(destination),
      externalCopy: externalCopy ? path.basename(externalCopy) : null
    });
    return result;
  } catch (error) {
    if (fs.existsSync(destination)) fs.unlinkSync(destination);
    writeBackupStatus(backupDirectory, {
      finishedAt: now.toISOString(),
      success: false,
      sizeBytes: 0,
      errorCode: errorCode(error)
    });
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
      console.error(JSON.stringify({ event: 'backup_failed', code: errorCode(error) }));
      process.exitCode = 1;
    });
}

module.exports = {
  createBackup,
  latestBackup,
  removeExpiredBackups,
  verifyDatabase,
  waitForDatabase,
  writeBackupStatus
};
