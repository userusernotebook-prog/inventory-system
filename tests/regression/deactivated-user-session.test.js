// Rodada 1, item 5 (regra R2): alterações administrativas cortam o acesso na hora.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { generate } = require('otplib');
const { createApp } = require('../../src/app');
const { createIntegrationContext, createUser, login } = require('../helpers/integration-context');

const password = 'SenhaDeTesteForte1';
const totpSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const reason = 'Ajuste solicitado pela gestão';

async function scenario(t) {
  const context = createIntegrationContext();
  t.after(() => context.close());
  const { db } = context;
  const app = createApp(db);
  const admin = await createUser(db, {
    name: 'Admin R2',
    email: 'admin.r2@example.test',
    profile: 'ADMIN'
  });
  db.prepare('UPDATE users SET totp_secret=?,totp_enabled=1 WHERE id=?').run(totpSecret, admin.id);
  const user = await createUser(db, {
    name: 'Tecnico R2',
    email: 'tecnico.r2@example.test',
    profile: 'TECNICO'
  });
  const signIn = async (email, code) => {
    const session = request.agent(app);
    const response = await login(session, email, password, code);
    return { session, response };
  };
  const adminSession = (await signIn(admin.email, await generate({ secret: totpSecret }))).session;
  const userBody = (overrides = {}) => ({
    name: user.name,
    email: user.email,
    profile_base: 'TECNICO',
    active: true,
    reason,
    ...overrides
  });
  const activeSessions = () =>
    db
      .prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=? AND revoked_at IS NULL')
      .get(user.id).n;
  return { db, app, admin, user, adminSession, signIn, userBody, activeSessions };
}

async function signedInUser(s) {
  const { session, response } = await s.signIn(s.user.email);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal((await session.get('/api/assets')).status, 200);
  return session;
}

test('desativar: a mesma sessão recebe 401 na requisição seguinte e reativar exige novo login', async (t) => {
  const s = await scenario(t);
  const session = await signedInUser(s);

  const deactivated = await s.adminSession
    .put(`/api/users/${s.user.id}`)
    .send(s.userBody({ active: false }));
  assert.equal(deactivated.status, 200, JSON.stringify(deactivated.body));
  assert.equal((await session.get('/api/assets')).status, 401);
  assert.equal((await session.get('/api/auth/me')).status, 401);
  assert.equal(s.activeSessions(), 0, 'as sessões devem ser revogadas na desativação');
  assert.equal((await s.signIn(s.user.email)).response.status, 401, 'inativo não entra');

  const reactivated = await s.adminSession
    .put(`/api/users/${s.user.id}`)
    .send(s.userBody({ active: true }));
  assert.equal(reactivated.status, 200, JSON.stringify(reactivated.body));
  assert.equal((await session.get('/api/assets')).status, 401, 'a sessão antiga continua inválida');
  const again = await signedInUser(s);
  assert.equal((await again.get('/api/auth/me')).status, 200);
});

test('usuário inativo não usa a API mesmo com sessão não revogada', async (t) => {
  const s = await scenario(t);
  const session = await signedInUser(s);
  s.db.prepare('UPDATE users SET active=0 WHERE id=?').run(s.user.id);
  assert.equal((await session.get('/api/assets')).status, 401);
});

test('redefinir senha, trocar perfil e alterar permissões ou alcance revogam as sessões', async (t) => {
  const s = await scenario(t);
  const changes = [
    [
      'redefinir senha',
      () =>
        s.adminSession
          .post(`/api/users/${s.user.id}/reset-password`)
          .send({ password: 'NovaSenhaProvisoria1', reason })
    ],
    [
      'trocar perfil',
      () =>
        s.adminSession.put(`/api/users/${s.user.id}`).send(s.userBody({ profile_base: 'CONSULTA' }))
    ],
    [
      'alterar permissões',
      () =>
        s.adminSession
          .put(`/api/users/${s.user.id}/overrides`)
          .send({ overrides: [{ permission: 'ticket:close', effect: 'deny' }], reason })
    ],
    [
      'alterar alcance',
      () =>
        s.adminSession
          .put(`/api/users/${s.user.id}/scopes`)
          .send({ scopes: [{ type: 'city', value: 'Recife' }], reason })
    ]
  ];
  for (const [label, change] of changes) {
    s.db
      .prepare('UPDATE users SET profile_base=?,must_change_password=0 WHERE id=?')
      .run('TECNICO', s.user.id);
    s.db
      .prepare(
        'UPDATE users SET password_hash=(SELECT password_hash FROM users WHERE id=?) WHERE id=?'
      )
      .run(s.admin.id, s.user.id);
    const session = await signedInUser(s);
    const response = await change();
    assert.equal(response.status, 200, `${label}: ${JSON.stringify(response.body)}`);
    assert.equal(
      (await session.get('/api/assets')).status,
      401,
      `${label}: a sessão continuou válida`
    );
    assert.equal(s.activeSessions(), 0, `${label}: ainda há sessão ativa`);
  }
});

test('falha no meio da alteração não deixa permissões parciais nem revoga sessões', async (t) => {
  const s = await scenario(t);
  s.db
    .prepare(
      "INSERT INTO user_permission_overrides(user_id,permission,effect) VALUES(?,'asset:create','deny')"
    )
    .run(s.user.id);
  const session = await signedInUser(s);
  const auditBefore = s.db.prepare('SELECT COUNT(*) n FROM audit_log').get().n;
  const failed = await s.adminSession.put(`/api/users/${s.user.id}/overrides`).send({
    overrides: [
      { permission: 'ticket:close', effect: 'deny' },
      { permission: 'ticket:close', effect: 'allow' }
    ],
    reason
  });
  assert.equal(failed.status, 409, JSON.stringify(failed.body));
  assert.deepEqual(
    s.db
      .prepare('SELECT permission,effect FROM user_permission_overrides WHERE user_id=?')
      .all(s.user.id),
    [{ permission: 'asset:create', effect: 'deny' }]
  );
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM audit_log').get().n, auditBefore);
  assert.equal((await session.get('/api/assets')).status, 200);
});

test('permissões são lidas a cada requisição, não guardadas na sessão', async (t) => {
  const s = await scenario(t);
  const session = await signedInUser(s);
  s.db
    .prepare(
      "INSERT INTO user_permission_overrides(user_id,permission,effect) VALUES(?,'asset:read','deny')"
    )
    .run(s.user.id);
  assert.equal((await session.get('/api/assets')).status, 403);
});
