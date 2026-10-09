const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const version = Number(process.argv[2]);
if (version !== 5) {
  throw new Error('Informe a migration reversível: npm run db:rollback -- 005');
}

const root = path.resolve(__dirname, '..');
const databasePath = path.join(root, 'data', 'inventory.db');
const downPath = path.join(
  root,
  'src',
  'db',
  'migrations',
  'down',
  '005_asset_state_machine.down.sql'
);
if (!fs.existsSync(databasePath)) throw new Error('Banco de dados não encontrado.');

const db = new Database(databasePath);
try {
  const latest = db.prepare('SELECT MAX(version) version FROM schema_migrations').get()?.version;
  if (latest !== version) {
    throw new Error(`A migration ${version} só pode ser revertida quando for a última aplicada.`);
  }

  db.pragma('foreign_keys = OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    db.exec(fs.readFileSync(downPath, 'utf8'));
    db.prepare('DELETE FROM schema_migrations WHERE version=?').run(version);
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // A transação pode não existir se a abertura do banco falhar.
    }
    throw error;
  } finally {
    db.pragma('foreign_keys = ON');
  }

  const invalidReferences = db.pragma('foreign_key_check');
  if (invalidReferences.length) {
    throw new Error(
      'A reversão terminou com referências inválidas. Restaure o backup criado antes da migration.'
    );
  }
  console.log(
    'Migration 005 revertida. Use a versão anterior do código antes de iniciar o sistema.'
  );
} finally {
  db.close();
}
