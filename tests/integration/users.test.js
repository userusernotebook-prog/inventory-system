const test = require('node:test');
const assert = require('node:assert/strict');
const { generate } = require('otplib');
const request = require('supertest');
const { createIntegrationContext, createUser, login } = require('../helpers/integration-context');

const password = 'SenhaDeTesteForte1';
const totpSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

async function createAdminSession(context) {
  const admin = await createUser(context.db, {
    name: 'Administrador',
    email: 'admin-users@example.test',
    password,
    profile: 'ADMIN'
  });
  context.db
    .prepare('UPDATE users SET totp_secret=?,totp_enabled=1 WHERE id=?')
    .run(totpSecret, admin.id);
  const signedIn = await login(
    context.agent,
    admin.email,
    password,
    await generate({ secret: totpSecret })
  );
  assert.equal(signedIn.status, 200, JSON.stringify(signedIn.body));
  return admin;
}

test('administrador gerencia todos os endpoints de usuarios', async () => {
  const context = createIntegrationContext();
  try {
    await createAdminSession(context);
    const created = await context.agent.post('/api/users').send({
      name: 'Pessoa Inicial',
      email: 'pessoa.inicial@example.test',
      password,
      profile_base: 'TECNICO'
    });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const userId = created.body.id;

    const list = await context.agent.get('/api/users');
    assert.equal(list.status, 200);
    assert.equal(
      list.body.items.some((user) => user.id === userId),
      true
    );

    const edited = await context.agent.put(`/api/users/${userId}`).send({
      name: 'Pessoa Editada',
      email: 'pessoa.editada@example.test',
      profile_base: 'RH',
      active: true
    });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    const updated = context.db.prepare('SELECT * FROM users WHERE id=?').get(userId);
    assert.equal(updated.name, 'Pessoa Editada');
    assert.equal(updated.email, 'pessoa.editada@example.test');
    assert.equal(updated.profile_base, 'RH');

    const deactivated = await context.agent.put(`/api/users/${userId}`).send({
      name: 'Pessoa Editada',
      email: 'pessoa.editada@example.test',
      profile_base: 'RH',
      active: false
    });
    assert.equal(deactivated.status, 200, JSON.stringify(deactivated.body));
    assert.equal(context.db.prepare('SELECT active FROM users WHERE id=?').get(userId).active, 0);

    const activated = await context.agent.put(`/api/users/${userId}`).send({
      name: 'Pessoa Editada',
      email: 'pessoa.editada@example.test',
      profile_base: 'RH',
      active: true
    });
    assert.equal(activated.status, 200, JSON.stringify(activated.body));

    const reset = await context.agent
      .post(`/api/users/${userId}/reset-password`)
      .send({ password: 'SenhaRedefinidaForte1' });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));
    assert.equal(
      context.db.prepare('SELECT must_change_password FROM users WHERE id=?').get(userId)
        .must_change_password,
      1
    );

    const targetAgent = request.agent(require('../../src/app').createApp(context.db));
    const targetLogin = await login(
      targetAgent,
      'pessoa.editada@example.test',
      'SenhaRedefinidaForte1'
    );
    assert.equal(targetLogin.status, 200, JSON.stringify(targetLogin.body));
    const forced = await context.agent.post(`/api/users/${userId}/force-logout`);
    assert.equal(forced.status, 200, JSON.stringify(forced.body));
    assert.equal((await targetAgent.get('/api/auth/me')).status, 401);

    const overrides = await context.agent.put(`/api/users/${userId}/overrides`).send({
      overrides: [
        { permission: 'asset:read', effect: 'allow' },
        { permission: 'employee:read', effect: 'deny' }
      ]
    });
    assert.equal(overrides.status, 200, JSON.stringify(overrides.body));
    const permissions = await context.agent.get(`/api/users/${userId}/permissions`);
    assert.equal(permissions.status, 200, JSON.stringify(permissions.body));
    assert.equal(permissions.body.granted.includes('asset:read'), true);
    assert.equal(permissions.body.denied.includes('employee:read'), true);

    const scopes = await context.agent.put(`/api/users/${userId}/scopes`).send({
      scopes: [{ type: 'city', value: 'São Paulo' }]
    });
    assert.equal(scopes.status, 200, JSON.stringify(scopes.body));
    assert.deepEqual(
      context.db
        .prepare('SELECT scope_type,scope_value FROM user_scopes WHERE user_id=?')
        .all(userId),
      [{ scope_type: 'city', scope_value: 'São Paulo' }]
    );
  } finally {
    context.close();
  }
});

test('usuario sem user:manage recebe acesso negado em todos os endpoints de usuarios', async () => {
  const context = createIntegrationContext();
  try {
    const consultation = await createUser(context.db, {
      name: 'Consulta',
      email: 'consulta-users@example.test',
      password,
      profile: 'CONSULTA'
    });
    const target = await createUser(context.db, {
      name: 'Alvo',
      email: 'alvo-users@example.test',
      password,
      profile: 'TECNICO'
    });
    assert.equal(
      (await login(context.agent, consultation.email, consultation.password)).status,
      200
    );

    const requests = [
      context.agent.get('/api/users'),
      context.agent.post('/api/users').send({
        name: 'Novo',
        email: 'novo-users@example.test',
        password,
        profile_base: 'TECNICO'
      }),
      context.agent.put(`/api/users/${target.id}`).send({
        name: 'Alvo',
        email: target.email,
        profile_base: 'TECNICO',
        active: true
      }),
      context.agent.post(`/api/users/${target.id}/reset-password`).send({ password }),
      context.agent.post(`/api/users/${target.id}/force-logout`),
      context.agent
        .put(`/api/users/${target.id}/overrides`)
        .send({ overrides: [{ permission: 'asset:read', effect: 'allow' }] }),
      context.agent
        .put(`/api/users/${target.id}/scopes`)
        .send({ scopes: [{ type: 'city', value: 'São Paulo' }] }),
      context.agent.get(`/api/users/${target.id}/permissions`)
    ];
    for (const response of await Promise.all(requests)) {
      assert.equal(response.status, 403, JSON.stringify(response.body));
    }
  } finally {
    context.close();
  }
});
