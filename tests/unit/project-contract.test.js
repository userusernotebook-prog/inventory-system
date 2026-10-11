const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('CI instala os navegadores antes do E2E e executa o build antes dele', () => {
  const workflow = read('.github/workflows/ci.yml');
  const build = workflow.indexOf('- run: npm run web:build');
  const installPlaywright = workflow.indexOf('- run: npx playwright install --with-deps');
  const e2e = workflow.indexOf('- run: npm run test:e2e');
  assert.ok(build >= 0);
  assert.ok(installPlaywright > build);
  assert.ok(e2e > installPlaywright);
});

test('README documenta scripts, variáveis e restauração do volume que o código oferece', () => {
  const readme = read('README.md');
  const packageJson = JSON.parse(read('package.json'));
  for (const script of [
    'start',
    'web:dev',
    'web:build',
    'web:typecheck',
    'backup',
    'backup:verify-restore',
    'create-admin',
    'reset-admin',
    'privacy:anonymize',
    'test:unit',
    'test:integration',
    'test:e2e',
    'coverage',
    'lint',
    'format:check'
  ]) {
    assert.ok(packageJson.scripts[script], `script ausente: ${script}`);
    const command = script === 'start' ? 'npm start' : `npm run ${script}`;
    assert.match(readme, new RegExp(command.replace(':', '\\:')));
  }
  for (const variable of [
    'TOTP_ENCRYPTION_KEY',
    'TOTP_ENCRYPTION_KEY_FILE',
    'APP_ORIGIN',
    'DATABASE_PATH',
    'BACKUP_DIR',
    'BACKUP_EXTERNAL_DIR',
    'AGE_RECIPIENT',
    'BACKUP_MONITOR_URL',
    'EMPLOYEE_ANONYMIZATION_DAYS'
  ]) {
    assert.match(readme, new RegExp('`' + variable + '`'));
  }
  assert.match(readme, /docker compose stop app backup/);
  assert.match(readme, /docker run --rm -v inventory-data:\/data/);
  assert.match(readme, /rm -f \/data\/inventory\.db-wal \/data\/inventory\.db-shm/);
  assert.doesNotMatch(readme, /db:rollback/);
  assert.match(readme, /request:approve/);
});

test('codigo morto legado não é servido nem mantido como script operacional', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(fs.existsSync(path.join(root, 'public', 'app.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'rollback-migration.js')), false);
  assert.equal(
    fs.existsSync(path.join(root, 'src/db/migrations/down/005_asset_state_machine.down.sql')),
    false
  );
  assert.equal(packageJson.scripts['db:rollback'], undefined);
  assert.doesNotMatch(read('public/index.html'), /app\.js/);
  assert.doesNotMatch(read('src/modules/assignments/assignments.service.js'), /offboard/);
});
