const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');

const projectDir = path.resolve(__dirname, '..');
const initSql = fs.readFileSync(
  path.join(projectDir, 'src', 'db', 'migrations', '001_init.sql'),
  'utf8'
);

function makeLegacySchema(sql) {
  return sql
    .replace(/^ {2}cost_center TEXT,\r?\n/m, '')
    .replace(/^ {2}hire_date TEXT,\r?\n/m, '')
    .replace(/,\r?\n {2}offboarded_at TEXT\r?\n/m, '\n');
}

function runMigration(testDir) {
  const result = spawnSync(process.execPath, ['-e', "require('./db')"], {
    cwd: testDir,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
}

function runRollback(testDir) {
  const result = spawnSync(process.execPath, ['scripts/rollback-migration.js', '005'], {
    cwd: testDir,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
}

test('migrations preservam registros dos bancos antigo e atual e são idempotentes', () => {
  for (const version of ['legacy', 'current']) {
    const testDir = fs.mkdtempSync(path.join(projectDir, '.migration-test-'));
    try {
      fs.mkdirSync(path.join(testDir, 'data'));
      fs.copyFileSync(path.join(projectDir, 'db.js'), path.join(testDir, 'db.js'));
      fs.cpSync(path.join(projectDir, 'src'), path.join(testDir, 'src'), { recursive: true });
      const dbPath = path.join(testDir, 'data', 'inventory.db');
      const db = new Database(dbPath);
      try {
        db.exec(version === 'legacy' ? makeLegacySchema(initSql) : initSql);
        db.prepare("INSERT INTO technicians(id,name,role) VALUES(7,'Gestor','admin')").run();
        db.prepare(
          "INSERT INTO employees(id,code,name) VALUES(11,'F11','Pessoa preservada')"
        ).run();
        db.prepare(
          "INSERT INTO assets(id,equipment_type,serial,status) VALUES(13,'Notebook','SER-13','assigned')"
        ).run();
        db.prepare('INSERT INTO assignments(asset_id,employee_id) VALUES(13,11)').run();
        db.prepare(
          "INSERT INTO movements(asset_id,to_status,movement_type) VALUES(13,'assigned','assign')"
        ).run();
        db.prepare(
          "INSERT INTO tickets(employee_id,asset_id,description) VALUES(11,13,'Chamado preservado')"
        ).run();
        db.prepare(
          "INSERT INTO audit_log(actor,action,entity_type) VALUES('Gestor','create','asset')"
        ).run();
      } finally {
        db.close();
      }

      runMigration(testDir);
      const historical = new Database(dbPath);
      try {
        const oldChecksum = crypto
          .createHash('sha256')
          .update(initSql.replace(/\r\n/g, '\n').replace(/\n$/, '\r\n'))
          .digest('hex');
        historical
          .prepare('UPDATE schema_migrations SET checksum=? WHERE version=1')
          .run(oldChecksum);
      } finally {
        historical.close();
      }
      const copiedMigrations = path.join(testDir, 'src', 'db', 'migrations');
      for (const file of fs.readdirSync(copiedMigrations).filter((name) => name.endsWith('.sql'))) {
        const migrationPath = path.join(copiedMigrations, file);
        const sql = fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n');
        fs.writeFileSync(migrationPath, sql.replace(/\n/g, '\r\n'));
      }
      runMigration(testDir);
      const migrated = new Database(dbPath);
      try {
        assert.equal(migrated.pragma('integrity_check', { simple: true }), 'ok');
        assert.deepEqual(migrated.pragma('foreign_key_check'), []);
        assert.equal(migrated.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n, 8);
        assert.equal(
          migrated.prepare('SELECT checksum FROM schema_migrations WHERE version=1').get().checksum,
          crypto.createHash('sha256').update(initSql.replace(/\r\n/g, '\n')).digest('hex')
        );
        assert.equal(
          migrated.prepare("SELECT COUNT(*) n FROM users WHERE profile_base='ADMIN'").get().n,
          1
        );
        assert.equal(
          migrated.prepare('SELECT name FROM employees WHERE id=11').get().name,
          'Pessoa preservada'
        );
        assert.equal(
          migrated.prepare('SELECT serial FROM assets WHERE id=13').get().serial,
          'SER-13'
        );
        assert.equal(
          migrated.prepare('SELECT status FROM assets WHERE id=13').get().status,
          'EM_USO'
        );
        const movement = migrated
          .prepare(
            'SELECT from_status,to_status,movement_type,responsible_user_id,occurred_at FROM movements'
          )
          .get();
        assert.equal(movement.from_status, 'DISPONIVEL');
        assert.equal(movement.to_status, 'EM_USO');
        assert.equal(movement.movement_type, 'ATRIBUICAO');
        assert.equal(movement.responsible_user_id, null);
        assert.match(movement.occurred_at, /Z$/);
        for (const table of ['assignments', 'movements', 'tickets', 'audit_log']) {
          assert.equal(migrated.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 1);
        }
        const columns = migrated.pragma('table_info(employees)').map((column) => column.name);
        for (const name of ['offboarded_at', 'cost_center', 'hire_date']) {
          assert.ok(columns.includes(name));
        }
        assert.throws(
          () => migrated.prepare('DELETE FROM movements WHERE id=1').run(),
          /imutáveis/
        );
      } finally {
        migrated.close();
      }
    } finally {
      assert.equal(path.dirname(path.resolve(testDir)), projectDir);
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }
});

test('a migration do estado do ativo pode ser revertida e aplicada novamente', () => {
  const testDir = fs.mkdtempSync(path.join(projectDir, '.migration-test-'));
  try {
    fs.mkdirSync(path.join(testDir, 'data'));
    fs.mkdirSync(path.join(testDir, 'scripts'));
    fs.copyFileSync(path.join(projectDir, 'db.js'), path.join(testDir, 'db.js'));
    fs.copyFileSync(
      path.join(projectDir, 'scripts', 'rollback-migration.js'),
      path.join(testDir, 'scripts', 'rollback-migration.js')
    );
    fs.cpSync(path.join(projectDir, 'src'), path.join(testDir, 'src'), { recursive: true });
    fs.rmSync(path.join(testDir, 'src', 'db', 'migrations', '006_users_and_permissions.sql'));
    fs.rmSync(path.join(testDir, 'src', 'db', 'migrations', '007_approval_requests.sql'));
    fs.rmSync(path.join(testDir, 'src', 'db', 'migrations', '008_offboarding_governance.sql'));
    const dbPath = path.join(testDir, 'data', 'inventory.db');
    const db = new Database(dbPath);
    try {
      db.exec(initSql);
      db.prepare(
        "INSERT INTO assets(id,equipment_type,serial,status) VALUES(1,'Notebook','SER-ROLLBACK','backup')"
      ).run();
    } finally {
      db.close();
    }

    runMigration(testDir);
    const migrated = new Database(dbPath);
    try {
      migrated.prepare("UPDATE assets SET status='EM_AVALIACAO' WHERE id=1").run();
    } finally {
      migrated.close();
    }

    runRollback(testDir);
    const rolledBack = new Database(dbPath);
    try {
      assert.equal(
        rolledBack.prepare('SELECT status FROM assets WHERE id=1').get().status,
        'backup'
      );
      assert.equal(
        rolledBack.prepare('SELECT MAX(version) version FROM schema_migrations').get().version,
        4
      );
    } finally {
      rolledBack.close();
    }

    runMigration(testDir);
    const reapplied = new Database(dbPath);
    try {
      assert.equal(
        reapplied.prepare('SELECT status FROM assets WHERE id=1').get().status,
        'EM_AVALIACAO'
      );
      assert.equal(
        reapplied
          .prepare(
            "SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name='movements_prevent_delete'"
          )
          .get().n,
        1
      );
    } finally {
      reapplied.close();
    }
  } finally {
    assert.equal(path.dirname(path.resolve(testDir)), projectDir);
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});
