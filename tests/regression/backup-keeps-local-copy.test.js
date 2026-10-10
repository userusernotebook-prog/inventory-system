// Rodada 1, item 3: a cópia local validada nunca é apagada por falha posterior.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');
const { childEnvironment, projectDir } = require('../helpers/app-process');
const { createBackup } = require('../../scripts/backup');

function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-backup-regression-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, 'inventory.db');
  const db = new Database(databasePath);
  db.exec('CREATE TABLE sample(value TEXT)');
  db.prepare('INSERT INTO sample(value) VALUES(?)').run('dado preservado');
  db.close();
  return { directory, databasePath, backupDirectory: path.join(directory, 'backups') };
}

function localBackups(backupDirectory) {
  return fs.existsSync(backupDirectory)
    ? fs.readdirSync(backupDirectory).filter((name) => /^inventory-.+\.db$/.test(name))
    : [];
}

function readStatus(backupDirectory) {
  return JSON.parse(fs.readFileSync(path.join(backupDirectory, 'backup-status.json'), 'utf8'));
}

function assertLocalCopyKept(backupDirectory) {
  const files = localBackups(backupDirectory);
  assert.equal(files.length, 1, `cópias locais: ${JSON.stringify(files)}`);
  const restored = new Database(path.join(backupDirectory, files[0]), { readonly: true });
  try {
    assert.equal(restored.prepare('SELECT value FROM sample').get().value, 'dado preservado');
  } finally {
    restored.close();
  }
  const status = readStatus(backupDirectory);
  assert.equal(status.steps.local.ok, true);
  assert.equal(status.steps.local.file, files[0]);
  return status;
}

async function recipient() {
  const age = await import('age-encryption');
  const identity = await age.generateIdentity();
  return { identity, recipient: await age.identityToRecipient(identity) };
}

async function attempt(options) {
  try {
    return await createBackup(options);
  } catch (error) {
    return { error };
  }
}

test('falha do ping de monitoramento mantém a cópia local', async (t) => {
  const { databasePath, backupDirectory } = setup(t);
  await attempt({
    databasePath,
    backupDirectory,
    monitorUrl: 'https://monitor.example.test/ping',
    fetchImpl: async () => ({ ok: false, status: 503 })
  });
  const status = assertLocalCopyKept(backupDirectory);
  assert.equal(status.success, false);
  assert.equal(status.steps.monitor.ok, false);
  assert.equal(status.steps.monitor.errorCode, 'MONITORING_PING_FAILED');
});

test('AGE_RECIPIENT ausente mantém a cópia local e registra a etapa externa', async (t) => {
  const { directory, databasePath, backupDirectory } = setup(t);
  await attempt({
    databasePath,
    backupDirectory,
    externalDirectory: path.join(directory, 'externo'),
    ageRecipient: ''
  });
  const status = assertLocalCopyKept(backupDirectory);
  assert.equal(status.success, false);
  assert.equal(status.steps.external.ok, false);
  assert.equal(status.steps.external.errorCode, 'EXTERNAL_ENCRYPTION_NOT_CONFIGURED');
});

test('destino externo indisponível mantém a cópia local', async (t) => {
  const { directory, databasePath, backupDirectory } = setup(t);
  const unavailable = path.join(directory, 'nao-e-pasta');
  fs.writeFileSync(unavailable, 'um arquivo no lugar da montagem');
  await attempt({
    databasePath,
    backupDirectory,
    externalDirectory: unavailable,
    ageRecipient: (await recipient()).recipient
  });
  const status = assertLocalCopyKept(backupDirectory);
  assert.equal(status.success, false);
  assert.equal(status.steps.external.ok, false);
  assert.equal(status.steps.external.errorCode, 'EXTERNAL_COPY_FAILED');
});

test('cópia externa é cifrada e conferida (cabeçalho age e tamanho)', async (t) => {
  const { directory, databasePath, backupDirectory } = setup(t);
  const keys = await recipient();
  const result = await createBackup({
    databasePath,
    backupDirectory,
    externalDirectory: path.join(directory, 'externo'),
    ageRecipient: keys.recipient
  });
  assert.equal(result.status.success, true);
  assert.equal(result.status.steps.external.ok, true);
  assert.equal(result.status.steps.external.headerVerified, true);
  assert.ok(result.status.steps.external.sizeBytes > 0);

  const { verifyAgeFile } = require('../../scripts/backup');
  assert.doesNotThrow(() => verifyAgeFile(result.externalCopy));
  const empty = path.join(directory, 'vazio.db.age');
  fs.writeFileSync(empty, '');
  assert.throws(() => verifyAgeFile(empty), /vazi/);
  const garbage = path.join(directory, 'lixo.db.age');
  fs.writeFileSync(garbage, 'SQLite format 3\0não cifrado');
  assert.throws(() => verifyAgeFile(garbage), /cabeçalho age/);
});

test('teste de restauração da cópia externa com a chave privada', async (t) => {
  const { directory, databasePath, backupDirectory } = setup(t);
  const keys = await recipient();
  const result = await createBackup({
    databasePath,
    backupDirectory,
    externalDirectory: path.join(directory, 'externo'),
    ageRecipient: keys.recipient
  });
  const identityFile = path.join(directory, 'chave-privada.txt');
  fs.writeFileSync(
    identityFile,
    `# created: teste\n# public key: ${keys.recipient}\n${keys.identity}\n`
  );
  const { verifyRestore } = require('../../scripts/verify-backup-restore');
  const verified = await verifyRestore(result.externalCopy, { identityFile });
  assert.equal(verified.restored, true);
  assert.equal(verified.encrypted, true);
  await assert.rejects(
    verifyRestore(result.externalCopy, { identityFile: '' }),
    /AGE_IDENTITY_FILE/
  );
});

test('serviço de backup recusa iniciar sem AGE_RECIPIENT e não entra em loop', (t) => {
  const { directory, databasePath, backupDirectory } = setup(t);
  fs.mkdirSync(backupDirectory);
  const previous = path.join(backupDirectory, 'inventory-2026-01-01T00-00-00-000Z.db');
  fs.writeFileSync(previous, 'backup anterior');
  const started = Date.now();
  const result = spawnSync(process.execPath, [path.join('scripts', 'backup-daemon.js')], {
    cwd: projectDir,
    env: childEnvironment({
      DATABASE_PATH: databasePath,
      BACKUP_DIR: backupDirectory,
      BACKUP_EXTERNAL_DIR: path.join(directory, 'externo'),
      AGE_RECIPIENT: '',
      TOTP_ENCRYPTION_KEY: '',
      ADMIN_PASSWORD: ''
    }),
    encoding: 'utf8',
    timeout: 20_000
  });
  assert.equal(result.status, 78, `saída ${result.status}: ${result.stderr}`);
  assert.ok(Date.now() - started < 15_000, 'o serviço demorou para recusar a configuração');
  assert.match(result.stderr, /AGE_RECIPIENT/);
  assert.deepEqual(localBackups(backupDirectory), [path.basename(previous)]);
});

test('aplicação recusa iniciar com BACKUP_EXTERNAL_DIR sem AGE_RECIPIENT', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./src/config/env')"], {
    cwd: projectDir,
    env: childEnvironment({
      TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
      BACKUP_EXTERNAL_DIR: path.join(os.tmpdir(), 'externo'),
      AGE_RECIPIENT: '',
      ADMIN_PASSWORD: ''
    }),
    encoding: 'utf8'
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AGE_RECIPIENT/);
});

test('falhas repetidas esperam cada vez mais, sem loop apertado', async () => {
  const { run } = require('../../scripts/backup-daemon');
  const outcomes = [false, false, false, true, false];
  const waits = [];
  await run({
    environment: {
      DATABASE_PATH: __filename,
      BACKUP_INTERVAL_SECONDS: '3600'
    },
    backup: async () => {
      const success = outcomes.shift();
      if (success === false && waits.length === 1) throw new Error('falha inesperada');
      return { status: { success } };
    },
    sleep: async (milliseconds) => waits.push(milliseconds / 1000),
    log: () => {},
    iterations: 5
  });
  assert.deepEqual(waits, [60, 120, 240, 3600, 60]);
});
