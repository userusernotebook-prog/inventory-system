const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');
const argon2 = require('argon2');

const projectDir = path.resolve(__dirname, '..', '..');
const password = 'SenhaDeTesteForte1';

function runScript(script, environment, args = []) {
  return spawnSync(process.execPath, [path.join('scripts', script), ...args], {
    cwd: projectDir,
    env: { ...process.env, ...environment },
    encoding: 'utf8'
  });
}

test('create-admin e reset-admin leem senha somente de fonte segura de automacao', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-admin-script-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, 'inventory.db');
  const environment = {
    DATABASE_PATH: databasePath,
    ADMIN_NAME: 'Administrador de teste',
    ADMIN_EMAIL: 'admin-script@example.test',
    ADMIN_PASSWORD: password
  };

  const created = runScript('create-admin.js', environment);
  assert.equal(created.status, 0, created.stderr);
  const database = new Database(databasePath);
  try {
    const admin = database.prepare("SELECT * FROM users WHERE profile_base='ADMIN'").get();
    assert.equal(admin.email, environment.ADMIN_EMAIL);
    assert.equal(admin.must_change_password, 1);
    assert.equal(await argon2.verify(admin.password_hash, password), true);
    database
      .prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)')
      .run('token', admin.id, '2026-10-09T12:00:00.000Z', '2026-10-09T10:00:00.000Z');
  } finally {
    database.close();
  }

  const resetPassword = 'OutraSenhaForte2';
  const reset = runScript('reset-admin.js', { ...environment, ADMIN_PASSWORD: resetPassword });
  assert.equal(reset.status, 0, reset.stderr);
  const resetDatabase = new Database(databasePath);
  try {
    const admin = resetDatabase.prepare("SELECT * FROM users WHERE profile_base='ADMIN'").get();
    assert.equal(await argon2.verify(admin.password_hash, resetPassword), true);
    assert.equal(admin.totp_secret, null);
    assert.equal(admin.totp_enabled, 0);
    assert.match(
      resetDatabase.prepare('SELECT revoked_at FROM sessions WHERE user_id=?').get(admin.id).revoked_at,
      /Z$/
    );
  } finally {
    resetDatabase.close();
  }
});

test('create-admin rejeita senha passada como argumento', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-admin-argument-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const result = runScript(
    'create-admin.js',
    { DATABASE_PATH: path.join(directory, 'inventory.db'), ADMIN_PASSWORD: password },
    ['Nome', 'email@example.test', password]
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /argumento/i);
});
