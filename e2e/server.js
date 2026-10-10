const Database = require('better-sqlite3');
const argon2 = require('argon2');
const { migrate } = require('../src/db/migrate');
const { createApp } = require('../src/app');

async function seed(db) {
  const passwordHash = await argon2.hash('SenhaDeTesteForte1');
  const insertUser = db.prepare(
    `INSERT INTO users(
      name, email, password_hash, profile_base, must_change_password, totp_enabled, totp_secret
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  insertUser.run(
    'Administrador E2E',
    'admin.e2e@example.test',
    passwordHash,
    'ADMIN',
    0,
    1,
    'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
  );
  insertUser.run('RH E2E', 'rh.e2e@example.test', passwordHash, 'RH', 0, 0, null);
  const deniedUserId = insertUser.run(
    'Consulta sem ativos',
    'sem-ativos.e2e@example.test',
    passwordHash,
    'CONSULTA',
    0,
    0,
    null
  ).lastInsertRowid;
  db.prepare(
    "INSERT INTO user_permission_overrides(user_id,permission,effect) VALUES(?, 'asset:read', 'deny')"
  ).run(deniedUserId);
  insertUser.run(
    'Senha provisoria',
    'provisoria.e2e@example.test',
    passwordHash,
    'CONSULTA',
    1,
    0,
    null
  );
  const technicianId = insertUser.run(
    'Tecnico E2E',
    'tecnico.e2e@example.test',
    passwordHash,
    'TECNICO',
    0,
    0,
    null
  ).lastInsertRowid;
  const employeeId = db
    .prepare(
      "INSERT INTO employees(name, email, status) VALUES('Pessoa E2E', 'pessoa.e2e@example.test', 'ativo')"
    )
    .run().lastInsertRowid;
  const assetId = db
    .prepare(
      "INSERT INTO assets(equipment_type, serial, status) VALUES('Notebook', 'E2E-OFFBOARD-1', 'EM_USO')"
    )
    .run().lastInsertRowid;
  db.prepare(
    'INSERT INTO assignments(asset_id, employee_id, responsible_user_id) VALUES(?, ?, ?)'
  ).run(assetId, employeeId, technicianId);
}

async function main() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  await seed(db);
  const app = createApp(db);
  app.get('/health', (_request, response) => response.status(200).json({ ok: true }));
  const server = app.listen(Number(process.env.PORT || 4173), '127.0.0.1');
  const close = () => server.close(() => db.close());
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
