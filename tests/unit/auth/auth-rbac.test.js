const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const argon2 = require('argon2');
const { generate } = require('otplib');

process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
const { migrate } = require('../../../src/db/migrate');
const { createAuthRepository } = require('../../../src/modules/auth/auth.repository');
const { createAuthService } = require('../../../src/modules/auth/auth.service');

async function makeContext() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  const passwordHash = await argon2.hash('SenhaInicialForte1');
  const adminId = db
    .prepare(
      "INSERT INTO users(name,email,password_hash,profile_base,must_change_password) VALUES(?,?,?,'ADMIN',0)"
    )
    .run('Admin', 'admin@example.test', passwordHash).lastInsertRowid;
  const audit = { logUser() {} };
  const repository = createAuthRepository(db);
  return { db, repository, service: createAuthService(repository, audit), adminId };
}

test('perfis, deny, alcance e proteção contra escalada de privilégios', async () => {
  const { db, repository, service, adminId } = await makeContext();
  try {
    const admin = repository.findById(adminId);
    const created = await service.createUser(
      {
        name: 'Técnica',
        email: 'tecnica@example.test',
        password: 'SenhaProvisoria1',
        profileBase: 'TECNICO'
      },
      admin
    );
    const technician = repository.findById(created.id);

    assert.doesNotThrow(() => service.authorize(technician, 'asset:create'));
    assert.throws(() => service.authorize(technician, 'report:financial'), /permissão/);

    service.setOverrides(created.id, [{ permission: 'asset:read', effect: 'deny' }], admin);
    assert.throws(() => service.authorize(technician, 'asset:read'), /permissão/);
    assert.doesNotThrow(() => service.authorize(technician, 'asset:create'));

    service.setScopes(created.id, [{ type: 'city', value: 'São Paulo' }], admin);
    assert.doesNotThrow(() => service.assertScope(technician, { city: 'São Paulo' }));
    assert.throws(() => service.assertScope(technician, { city: 'Rio de Janeiro' }), /alcance/);

    assert.throws(
      () => service.setOverrides(created.id, [{ permission: '*:*', effect: 'allow' }], technician),
      /próprios privilégios/
    );
    assert.throws(
      () => service.updateUser(created.id, { ...technician, profileBase: 'ADMIN' }, technician),
      /próprios privilégios/
    );
    await assert.rejects(
      service.createUser(
        {
          name: 'Segundo administrador',
          email: 'outro-admin@example.test',
          password: 'SenhaProvisoria1',
          profileBase: 'ADMIN'
        },
        admin
      ),
      /create-admin/
    );
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO users(name,email,password_hash,profile_base) VALUES('Segundo','segundo@example.test','x','ADMIN')"
          )
          .run(),
      /UNIQUE/
    );
  } finally {
    db.close();
  }
});

test('login cria sessão vinculada ao usuário, com senha Argon2', async () => {
  const { db, repository, service, adminId } = await makeContext();
  try {
    const login = await service.login({
      email: 'admin@example.test',
      password: 'SenhaInicialForte1'
    });
    const authenticated = service.authenticate(login.token);
    assert.equal(authenticated.id, Number(adminId));
    assert.equal(authenticated.profile_base, 'ADMIN');
    assert.equal(repository.findById(adminId).last_login_at !== null, true);
  } finally {
    db.close();
  }
});

test('2FA só é confirmado com um código TOTP válido', async () => {
  const { db, repository, service, adminId } = await makeContext();
  try {
    const admin = repository.findById(adminId);
    const enrollment = service.setupTotp(admin);
    await assert.rejects(service.confirmTotp(admin, '000000'), /TOTP inválido/);
    const code = await generate({ secret: enrollment.secret });
    assert.deepEqual(await service.confirmTotp(admin, code), { ok: true });
    const login = await service.login({
      email: 'admin@example.test',
      password: 'SenhaInicialForte1',
      totp_code: code
    });
    assert.ok(login.token);
  } finally {
    db.close();
  }
});
