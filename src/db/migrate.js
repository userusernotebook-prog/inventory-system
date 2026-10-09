const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const migrationsDir = path.join(__dirname, 'migrations');
const legacyColumns = new Map([
  [2, 'offboarded_at'],
  [3, 'cost_center'],
  [4, 'hire_date']
]);

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = new Map(
    db
      .prepare('SELECT version, name, checksum FROM schema_migrations')
      .all()
      .map((row) => [row.version, row])
  );
  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => /^\d{3}_.+\.sql$/.test(name))
    .sort();
  const knownVersions = new Set(files.map((file) => Number(file.slice(0, 3))));
  for (const version of applied.keys()) {
    if (!knownVersions.has(version)) {
      throw new Error(
        `O banco usa a migration ${version}, desconhecida por esta versão do sistema.`
      );
    }
  }

  for (const file of files) {
    const version = Number(file.slice(0, 3));
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const previous = applied.get(version);
    if (previous) {
      if (previous.name !== file || previous.checksum !== checksum) {
        throw new Error(`A migration ${file} foi alterada após sua aplicação.`);
      }
      continue;
    }

    db.transaction(() => {
      const column = legacyColumns.get(version);
      const alreadyPresent =
        column && db.pragma('table_info(employees)').some((entry) => entry.name === column);
      if (!alreadyPresent) db.exec(sql);
      db.prepare('INSERT INTO schema_migrations(version,name,checksum) VALUES(?,?,?)').run(
        version,
        file,
        checksum
      );
    })();
  }
}

module.exports = { migrate };
