const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const {
  createBackup,
  waitForDatabase,
  writeBackupStatus
} = require('../../../scripts/backup');

function createTemporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-backup-test-'));
}

test('aguarda o banco existir, registra sucesso e só notifica após backup concluído', async (t) => {
  const directory = createTemporaryDirectory();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const databasePath = path.join(directory, 'inventory.db');
  const backupDirectory = path.join(directory, 'backups');
  const database = new Database(databasePath);
  database.exec('CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT)');
  database.prepare('INSERT INTO sample(value) VALUES(?)').run('preservado');
  database.close();

  let existenceChecks = 0;
  const waits = [];
  await waitForDatabase({
    databasePath,
    retryMs: 30_000,
    exists: () => {
      existenceChecks += 1;
      return existenceChecks >= 2;
    },
    sleep: async (milliseconds) => waits.push(milliseconds)
  });
  assert.deepEqual(waits, [30_000]);

  const pings = [];
  const result = await createBackup({
    databasePath,
    backupDirectory,
    now: new Date('2026-10-09T15:00:00.000Z'),
    monitorUrl: 'https://monitor.example.test/ping',
    fetchImpl: async (url) => {
      pings.push(url);
      return { ok: true, status: 200 };
    }
  });

  assert.ok(fs.existsSync(result.destination));
  assert.equal(pings.length, 1);
  assert.equal(pings[0], 'https://monitor.example.test/ping');
  const status = JSON.parse(fs.readFileSync(path.join(backupDirectory, 'backup-status.json'), 'utf8'));
  assert.equal(status.success, true);
  assert.equal(status.sizeBytes > 0, true);
  assert.match(status.finishedAt, /Z$/);
});

test('falha de backup registra status sem notificar monitoramento', async (t) => {
  const directory = createTemporaryDirectory();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const backupDirectory = path.join(directory, 'backups');
  await assert.rejects(
    createBackup({
      databasePath: path.join(directory, 'ausente.db'),
      backupDirectory,
      monitorUrl: 'https://monitor.example.test/ping',
      fetchImpl: async () => assert.fail('O ping não pode acontecer quando o backup falha')
    }),
    /Banco ainda nao existe/
  );

  const status = JSON.parse(fs.readFileSync(path.join(backupDirectory, 'backup-status.json'), 'utf8'));
  assert.equal(status.success, false);
  assert.equal(status.errorCode, 'DATABASE_NOT_FOUND');
  assert.equal(typeof writeBackupStatus, 'function');
});

test('copia externa e cifrada com age, sem expor o SQLite fora do servidor', async (t) => {
  const directory = createTemporaryDirectory();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, 'inventory.db');
  const database = new Database(databasePath);
  database.exec('CREATE TABLE secret_data (value TEXT)');
  database.prepare('INSERT INTO secret_data(value) VALUES(?)').run('dado pessoal');
  database.close();

  const age = await import('age-encryption');
  const identity = await age.generateIdentity();
  const recipient = await age.identityToRecipient(identity);
  const externalDirectory = path.join(directory, 'external');
  const result = await createBackup({
    databasePath,
    backupDirectory: path.join(directory, 'backups'),
    externalDirectory,
    ageRecipient: recipient,
    now: new Date('2026-10-09T15:01:00.000Z')
  });

  assert.match(result.externalCopy, /\.db\.age$/);
  assert.equal(fs.existsSync(path.join(externalDirectory, path.basename(result.destination))), false);
  const decrypter = new age.Decrypter();
  decrypter.addIdentity(identity);
  const plaintext = await decrypter.decrypt(fs.readFileSync(result.externalCopy));
  assert.deepEqual(Buffer.from(plaintext), fs.readFileSync(result.destination));
});
