const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const migrationsDir = path.join(__dirname, 'migrations');
const legacyColumns = new Map([
  [2, 'offboarded_at'],
  [3, 'cost_center'],
  [4, 'hire_date']
]);
const structuralMigrations = new Set([5, 6, 8]);

function applyStructuralMigration(db, sql, record) {
  db.pragma('foreign_keys = OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations(version,name,checksum) VALUES(?,?,?)').run(
      record.version,
      record.file,
      record.checksum
    );
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // A transação pode não ter sido iniciada quando a leitura do banco falhar.
    }
    throw error;
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

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
    const source = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const sql = source.replace(/\r\n/g, '\n');
    const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
    const checksum = hash(sql);
    const compatibleChecksums = new Set([
      checksum,
      hash(source),
      hash(sql.replace(/\n/g, '\r\n')),
      hash(sql.replace(/\n$/, '\r\n'))
    ]);
    const previous = applied.get(version);
    if (previous) {
      if (previous.name !== file || !compatibleChecksums.has(previous.checksum)) {
        throw new Error(`A migration ${file} foi alterada após sua aplicação.`);
      }
      if (previous.checksum !== checksum) {
        db.prepare('UPDATE schema_migrations SET checksum=? WHERE version=?').run(
          checksum,
          version
        );
      }
      continue;
    }

    if (structuralMigrations.has(version)) {
      applyStructuralMigration(db, sql, { version, file, checksum });
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
