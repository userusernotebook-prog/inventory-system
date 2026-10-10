// Rodada 1, item 2: instalação local do zero seguindo o README.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const {
  childEnvironment,
  copyProject,
  freePort,
  httpClient,
  removeDirectory,
  runNpmScript,
  startServer
} = require('../helpers/app-process');

const DOCUMENTED = [
  'PORT',
  'NODE_ENV',
  'APP_ORIGIN',
  'TOTP_ENCRYPTION_KEY',
  'TOTP_ENCRYPTION_KEY_FILE',
  'TOTP_ENCRYPTION_KEY_SECRET_FILE',
  'EMPLOYEE_ANONYMIZATION_DAYS',
  'DATABASE_PATH',
  'BACKUP_DIR',
  'BACKUP_RETENTION_DAYS',
  'BACKUP_INTERVAL_SECONDS',
  'BACKUP_EXTERNAL_DIR',
  'BACKUP_EXTERNAL_HOST_DIR',
  'AGE_RECIPIENT',
  'BACKUP_MONITOR_URL',
  'ADMIN_NAME',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD_FILE'
];
const adminPassword = 'SenhaProvisoriaForte1';

// Preenche NOME=valor no .env, descomentando a linha de exemplo quando existir.
function setValue(content, name, value) {
  const line = new RegExp(`^#?\\s*${name}=.*$`, 'm');
  return line.test(content)
    ? content.replace(line, `${name}=${value}`)
    : `${content}\n${name}=${value}\n`;
}

test('.env.example documenta todas as variáveis e traz a chave do 2FA sem valor', () => {
  const example = fs.readFileSync(path.join(__dirname, '..', '..', '.env.example'), 'utf8');
  const missing = DOCUMENTED.filter((name) => !new RegExp(`^#?\\s*${name}=`, 'm').test(example));
  assert.deepEqual(missing, [], `variáveis sem documentação: ${missing.join(', ')}`);
  assert.match(example, /^TOTP_ENCRYPTION_KEY=$/m, 'TOTP_ENCRYPTION_KEY deve estar ativa e vazia');
  assert.match(
    example,
    /randomBytes\(32\)\.toString\('base64'\)/,
    'falta o comando para gerar a chave'
  );
});

test('create-admin, reset-admin e backup leem o .env', (t) => {
  const directory = copyProject();
  t.after(() => removeDirectory(directory));
  const databasePath = path.join(directory, 'banco-local', 'inventory.db');
  const backupDirectory = path.join(directory, 'backups-locais');
  fs.writeFileSync(
    path.join(directory, '.env'),
    [
      `TOTP_ENCRYPTION_KEY=${crypto.randomBytes(32).toString('base64')}`,
      `DATABASE_PATH=${databasePath}`,
      `BACKUP_DIR=${backupDirectory}`,
      'ADMIN_NAME=Admin Local',
      'ADMIN_EMAIL=admin.local@example.test',
      ''
    ].join('\n')
  );
  // A senha vem do ambiente da automação, nunca do .env nem de argumento.
  const automation = childEnvironment({ ADMIN_PASSWORD: adminPassword });

  const created = runNpmScript(directory, 'create-admin', [], automation);
  assert.equal(created.status, 0, `create-admin:\n${created.stdout}\n${created.stderr}`);
  const db = new Database(databasePath, { readonly: true });
  try {
    assert.equal(
      db.prepare("SELECT email FROM users WHERE profile_base='ADMIN'").get()?.email,
      'admin.local@example.test'
    );
  } finally {
    db.close();
  }

  const reset = runNpmScript(directory, 'reset-admin', [], automation);
  assert.equal(reset.status, 0, `reset-admin:\n${reset.stdout}\n${reset.stderr}`);

  const backup = runNpmScript(directory, 'backup', [], childEnvironment());
  assert.equal(backup.status, 0, `backup:\n${backup.stdout}\n${backup.stderr}`);
  assert.ok(
    fs.existsSync(backupDirectory) &&
      fs.readdirSync(backupDirectory).some((name) => /^inventory-.+\.db$/.test(name)),
    'o backup não foi gravado no BACKUP_DIR do .env'
  );
});

test('instalação do zero: copiar .env.example, preencher a chave, create-admin e npm start', async (t) => {
  const directory = copyProject();
  let server;
  t.after(async () => {
    if (server) await server.stop();
    removeDirectory(directory);
  });
  const port = await freePort();

  let content = fs.readFileSync(path.join(directory, '.env.example'), 'utf8');
  assert.match(
    content,
    /^TOTP_ENCRYPTION_KEY=$/m,
    'o exemplo não traz a linha da chave para preencher'
  );
  content = setValue(content, 'TOTP_ENCRYPTION_KEY', crypto.randomBytes(32).toString('base64'));
  content = setValue(content, 'PORT', String(port));
  fs.writeFileSync(path.join(directory, '.env'), content);

  const created = runNpmScript(
    directory,
    'create-admin',
    ['Admin Local', 'admin.local@example.test'],
    childEnvironment({ ADMIN_PASSWORD: adminPassword })
  );
  assert.equal(created.status, 0, `create-admin:\n${created.stdout}\n${created.stderr}`);

  server = await startServer(directory, childEnvironment(), { port, npmStart: true });
  const login = await httpClient(server.baseUrl).post('/api/auth/login', {
    email: 'admin.local@example.test',
    password: adminPassword
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.equal(login.body.must_change_password, true);
  assert.equal(login.body.requires_totp_enrollment, true);
});
