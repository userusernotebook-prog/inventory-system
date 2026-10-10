// Rodada 1, item 1: no Docker a chave do 2FA chega somente por TOTP_ENCRYPTION_KEY_FILE.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const argon2 = require('argon2');
const { generate } = require('otplib');
const { migrate } = require('../../src/db/migrate');
const {
  childEnvironment,
  copyProject,
  freePort,
  httpClient,
  removeDirectory,
  startServer
} = require('../helpers/app-process');

const password = 'SenhaProvisoriaForte1';
const newPassword = 'SenhaDefinitivaForte2';

test('servidor iniciado só com TOTP_ENCRYPTION_KEY_FILE conclui o 2FA do admin', async (t) => {
  const directory = copyProject();
  let server;
  t.after(async () => {
    if (server) await server.stop();
    removeDirectory(directory);
  });
  const keyFile = path.join(directory, 'totp_key.txt');
  fs.writeFileSync(keyFile, `${crypto.randomBytes(32).toString('base64')}\n`);
  const databasePath = path.join(directory, 'data', 'inventory.db');
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  migrate(db);
  db.prepare(
    `INSERT INTO users(name,email,password_hash,profile_base,must_change_password)
     VALUES('Admin Docker','admin.docker@example.test',?,'ADMIN',1)`
  ).run(await argon2.hash(password));
  db.close();

  server = await startServer(
    directory,
    childEnvironment({
      PORT: String(await freePort()),
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://inventario.example.test',
      DATABASE_PATH: databasePath,
      TOTP_ENCRYPTION_KEY_FILE: keyFile
    })
  );
  const client = httpClient(server.baseUrl);

  const login = await client.post('/api/auth/login', {
    email: 'admin.docker@example.test',
    password
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const changed = await client.post('/api/auth/change-password', { password: newPassword });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));

  const setup = await client.post('/api/auth/totp/setup');
  assert.equal(setup.status, 200, `totp/setup: ${JSON.stringify(setup.body)}\n${server.output()}`);
  const confirmed = await client.post('/api/auth/totp/confirm', {
    code: await generate({ secret: setup.body.secret })
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));

  const api = await client.get('/api/employees');
  assert.equal(api.status, 200, JSON.stringify(api.body));
});

test('a chave do 2FA vem de uma única fonte e é validada', () => {
  const { resolveTotpEncryptionKey } = require('../../src/config/totp-key');
  const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'totp-key-'));
  try {
    const key = crypto.randomBytes(32).toString('base64');
    const keyFile = path.join(directory, 'key.txt');
    fs.writeFileSync(keyFile, `${key}\n`);

    assert.equal(resolveTotpEncryptionKey({ TOTP_ENCRYPTION_KEY: key }), key);
    assert.equal(resolveTotpEncryptionKey({ TOTP_ENCRYPTION_KEY_FILE: keyFile }), key);
    assert.throws(
      () =>
        resolveTotpEncryptionKey({ TOTP_ENCRYPTION_KEY: key, TOTP_ENCRYPTION_KEY_FILE: keyFile }),
      /TOTP_ENCRYPTION_KEY.*TOTP_ENCRYPTION_KEY_FILE.*não as duas/
    );
    assert.throws(() => resolveTotpEncryptionKey({}), /obrigatória/);
    assert.throws(() => resolveTotpEncryptionKey({ TOTP_ENCRYPTION_KEY: 'curta' }), /32 bytes/);
    assert.throws(
      () => resolveTotpEncryptionKey({ TOTP_ENCRYPTION_KEY_FILE: path.join(directory, 'ausente') }),
      /TOTP_ENCRYPTION_KEY_FILE/
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
