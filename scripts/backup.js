const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { BackupConfigError, backupConfigProblems } = require('../src/config/backup-config');

const root = path.resolve(__dirname, '..');
const AGE_HEADER = Buffer.from('age-encryption.org/v1\n');

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

function readBackupStatus(backupDirectory) {
  try {
    return JSON.parse(fs.readFileSync(backupStatusPath(backupDirectory), 'utf8'));
  } catch {
    return null;
  }
}

function codedError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function createDatabaseNotFoundError(databasePath) {
  return codedError('DATABASE_NOT_FOUND', `Banco ainda nao existe: ${databasePath}`);
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

// O servidor não tem a chave privada, então confere o que é possível sem ela:
// o arquivo existe, não está vazio e começa com o cabeçalho do formato age.
function verifyAgeFile(file) {
  const sizeBytes = fs.statSync(file).size;
  if (sizeBytes === 0) throw new Error('A cópia cifrada está vazia.');
  const header = Buffer.alloc(AGE_HEADER.length);
  const descriptor = fs.openSync(file, 'r');
  try {
    fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  if (sizeBytes <= AGE_HEADER.length || !header.equals(AGE_HEADER)) {
    throw new Error('A cópia externa não tem um cabeçalho age válido.');
  }
  return { sizeBytes };
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
    throw codedError(
      'EXTERNAL_ENCRYPTION_NOT_CONFIGURED',
      'AGE_RECIPIENT e obrigatorio quando BACKUP_EXTERNAL_DIR estiver definido.'
    );
  }
  const destination = path.join(externalDirectory, `${path.basename(sourceFile)}.age`);
  const partial = `${destination}.partial`;
  try {
    const age = await import('age-encryption');
    fs.mkdirSync(externalDirectory, { recursive: true });
    const encrypter = new age.Encrypter();
    encrypter.addRecipient(recipient);
    const encrypted = await encrypter.encrypt(fs.readFileSync(sourceFile));
    fs.writeFileSync(partial, encrypted, { flag: 'wx', mode: 0o600 });
    fs.renameSync(partial, destination);
  } catch (error) {
    // Se o diretório externo foi montado incorretamente (por exemplo, é um
    // arquivo), o caminho parcial não pode ser removido. Essa limpeza não
    // pode ocultar o erro de cópia que será registrado no status do backup.
    try {
      fs.rmSync(partial, { force: true });
    } catch {
      // Não há arquivo parcial acessível para remover.
    }
    throw codedError(
      'EXTERNAL_COPY_FAILED',
      `Falha ao gravar a cópia externa: ${error.message}`,
      error
    );
  }
  try {
    return { destination, ...verifyAgeFile(destination) };
  } catch (error) {
    throw codedError('EXTERNAL_COPY_INVALID', error.message, error);
  }
}

async function sendMonitoringPing(monitorUrl, fetchImpl = global.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw codedError(
      'MONITORING_PING_FAILED',
      'Fetch nao esta disponivel para enviar o ping de monitoramento.'
    );
  }
  let response;
  try {
    response = await fetchImpl(monitorUrl, { method: 'GET', redirect: 'error' });
  } catch (error) {
    throw codedError('MONITORING_PING_FAILED', 'O ping de monitoramento falhou.', error);
  }
  if (!response.ok) {
    throw codedError(
      'MONITORING_PING_FAILED',
      `O ping de monitoramento falhou com HTTP ${response.status}.`
    );
  }
}

function failure(error, fallbackCode) {
  return { ok: false, errorCode: error?.code || fallbackCode, message: error?.message };
}

// Etapas independentes: a cópia local só é descartada se ela mesma falhar
// antes de ser validada. Falhas na retenção, na cópia externa, na
// criptografia ou no monitoramento ficam registradas na própria etapa.
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
    throw new BackupConfigError(['BACKUP_RETENTION_DAYS deve ser um inteiro maior ou igual a 1.']);
  }
  const previous = readBackupStatus(backupDirectory);
  const steps = {
    local: { ok: false },
    retention: { ok: false, skipped: true },
    external: externalDirectory ? { ok: false } : { ok: true, skipped: true },
    monitor: monitorUrl ? { ok: false } : { ok: true, skipped: true }
  };
  const record = (destination, externalCopy, sizeBytes) => {
    const failed = Object.values(steps).find((step) => !step.ok && !step.skipped);
    const success = !failed;
    const status = {
      finishedAt: now.toISOString(),
      success,
      sizeBytes,
      destination: destination ? path.basename(destination) : null,
      externalCopy: externalCopy ? path.basename(externalCopy) : null,
      errorCode: failed ? failed.errorCode : null,
      steps
    };
    status.lastSuccessful = success
      ? {
          finishedAt: status.finishedAt,
          sizeBytes,
          destination: status.destination,
          externalCopy: status.externalCopy
        }
      : previous?.lastSuccessful || null;
    writeBackupStatus(backupDirectory, status);
    return status;
  };

  if (!fs.existsSync(databasePath)) {
    const error = createDatabaseNotFoundError(databasePath);
    steps.local = failure(error);
    record(null, null, 0);
    throw error;
  }

  fs.mkdirSync(backupDirectory, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const destination = path.join(backupDirectory, `inventory-${stamp}.db`);
  const source = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(destination);
    verifyDatabase(destination);
  } catch (error) {
    // Arquivo incompleto ou corrompido: não é uma cópia válida para manter.
    fs.rmSync(destination, { force: true });
    steps.local = failure(error, 'LOCAL_BACKUP_FAILED');
    record(null, null, 0);
    throw error;
  } finally {
    source.close();
  }
  const sizeBytes = fs.statSync(destination).size;
  steps.local = {
    ok: true,
    file: path.basename(destination),
    sizeBytes,
    verifiedAt: new Date().toISOString()
  };

  let removed = 0;
  try {
    removed = removeExpiredBackups(backupDirectory, retentionDays, now.getTime());
    steps.retention = { ok: true, removed };
  } catch (error) {
    steps.retention = failure(error, 'RETENTION_FAILED');
  }

  let externalCopy = null;
  if (externalDirectory) {
    try {
      const copy = await encryptExternalCopy(destination, externalDirectory, ageRecipient);
      externalCopy = copy.destination;
      steps.external = {
        ok: true,
        file: path.basename(copy.destination),
        sizeBytes: copy.sizeBytes,
        headerVerified: true
      };
      try {
        steps.external.removed = removeExpiredBackups(
          externalDirectory,
          retentionDays,
          now.getTime()
        );
      } catch (error) {
        steps.external.retentionErrorCode = error.code || 'RETENTION_FAILED';
      }
    } catch (error) {
      steps.external = failure(error, 'EXTERNAL_COPY_FAILED');
    }
  }

  if (monitorUrl) {
    const incomplete = Object.entries(steps).some(
      ([name, step]) => name !== 'monitor' && !step.ok && !step.skipped
    );
    if (incomplete) {
      // O monitor só recebe sinal de sucesso; a ausência dele gera o alerta.
      steps.monitor = { ok: false, skipped: true, reason: 'backup_incompleto' };
    } else {
      try {
        await sendMonitoringPing(monitorUrl, fetchImpl);
        steps.monitor = { ok: true };
      } catch (error) {
        steps.monitor = failure(error, 'MONITORING_PING_FAILED');
      }
    }
  }

  const status = record(destination, externalCopy, sizeBytes);
  return { destination, externalCopy, removed, sizeBytes, status };
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
  require('../src/config/load-env').loadEnv();
  const problems = backupConfigProblems(process.env);
  if (problems.length) {
    console.error(JSON.stringify({ event: 'backup_config_invalid', message: problems.join(' ') }));
    process.exitCode = 78;
  } else {
    createBackup()
      .then(({ status }) => {
        console.log(
          JSON.stringify({
            event: status.success ? 'backup_created' : 'backup_incomplete',
            destination: status.destination,
            externalCopy: status.externalCopy,
            errorCode: status.errorCode,
            steps: status.steps
          })
        );
        if (!status.success) process.exitCode = 1;
      })
      .catch((error) => {
        console.error(
          JSON.stringify({ event: 'backup_failed', code: error.code || 'BACKUP_FAILED' })
        );
        process.exitCode = error instanceof BackupConfigError ? 78 : 1;
      });
  }
}

module.exports = {
  createBackup,
  latestBackup,
  readBackupStatus,
  removeExpiredBackups,
  verifyAgeFile,
  verifyDatabase,
  waitForDatabase,
  writeBackupStatus
};
