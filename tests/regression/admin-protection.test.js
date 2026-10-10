// Rodada 2, item 4 (e regra R4): permissões exclusivas e conta do admin protegidas.
const test = require('node:test');
const assert = require('node:assert/strict');
const { apiScenario } = require('../helpers/regression-scenario');
const { createAuthRepository } = require('../../src/modules/auth/auth.repository');
const { createAuthService } = require('../../src/modules/auth/auth.service');
const { createAuditRepository } = require('../../src/modules/audit/audit.repository');
const { createAuditService } = require('../../src/modules/audit/audit.service');

function services(s) {
  const repository = createAuthRepository(s.db);
  return {
    repository,
    auth: createAuthService(repository, createAuditService(createAuditRepository(s.db)))
  };
}
const userRow = (s, id) => s.db.prepare('SELECT * FROM users WHERE id=?').get(id);
const override = (s, userId, permission, effect) =>
  s.db
    .prepare('INSERT INTO user_permission_overrides(user_id,permission,effect) VALUES(?,?,?)')
    .run(userId, permission, effect);

test('user:manage e request:approve não são concedidas por permissão individual', async (t) => {
  const s = await apiScenario(t);
  for (const permission of ['user:manage', 'request:approve']) {
    const response = await s.adminSession
      .put(`/api/users/${s.hr.id}/overrides`)
      .send({ overrides: [{ permission, effect: 'allow' }], reason: 'Tentativa de delegar' });
    assert.equal(response.status, 403, `${permission}: ${JSON.stringify(response.body)}`);
  }
  assert.equal(
    s.db.prepare('SELECT COUNT(*) n FROM user_permission_overrides WHERE user_id=?').get(s.hr.id).n,
    0
  );
});

test('exclusivas gravadas direto no banco são ignoradas para quem não é admin', async (t) => {
  const s = await apiScenario(t);
  override(s, s.hr.id, 'user:manage', 'allow');
  override(s, s.technician.id, 'request:approve', 'allow');
  s.db
    .prepare(
      "INSERT INTO role_permissions(profile_base,permission) VALUES('TECNICO','request:approve')"
    )
    .run();
  const hr = await s.sessionFor(s.hr);
  const technician = await s.sessionFor(s.technician);

  assert.equal((await hr.get('/api/users')).status, 403);
  assert.equal(
    (
      await hr
        .post(`/api/users/${s.admin.id}/reset-password`)
        .send({ password: 'SenhaDoInvasor12', reason: 'Tentativa registrada' })
    ).status,
    403
  );

  const person = s.employee('Pessoa');
  const own = await technician.post('/api/approval-requests').send({
    type: 'USO_EQUIPAMENTO_BACKUP',
    asset_id: s.asset('BACKUP', 'R4-PROPRIA'),
    employee_id: person,
    justification: 'Preciso'
  });
  assert.equal(own.status, 201, JSON.stringify(own.body));
  assert.equal(
    (await technician.post(`/api/approval-requests/${own.body.id}/approve`).send({})).status,
    403
  );
  const me = await technician.get('/api/auth/me');
  assert.ok(!me.body.permissions.granted.includes('request:approve'));
  assert.equal(
    s.status(
      s.db
        .prepare('SELECT asset_id FROM approval_request_assets WHERE request_id=?')
        .get(own.body.id).asset_id
    ),
    'BACKUP'
  );
});

test('R4: só o admin aprova; a auto-aprovação dele fica marcada na auditoria', async (t) => {
  const s = await apiScenario(t);
  const { auth } = services(s);
  const person = s.employee('Pessoa');
  const created = await s.adminSession.post('/api/approval-requests').send({
    type: 'USO_EQUIPAMENTO_BACKUP',
    asset_id: s.asset('BACKUP', 'R4-ADMIN'),
    employee_id: person,
    justification: 'Reposição urgente'
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const approved = await s.adminSession
    .post(`/api/approval-requests/${created.body.id}/approve`)
    .send({ reason: 'Aprovado' });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.auto_approved, true);
  const audit = s.db
    .prepare("SELECT details FROM audit_log WHERE action='approval_approved' AND entity_id=?")
    .get(created.body.id);
  assert.match(audit.details, /auto-aprovada/);
  assert.ok(auth.can(userRow(s, s.admin.id), 'request:approve'));
  assert.ok(!auth.can(userRow(s, s.technician.id), 'request:approve'));
});

test('nenhuma ação sobre a conta do admin é aceita de outro usuário', async (t) => {
  const s = await apiScenario(t);
  const { auth } = services(s);
  const actor = userRow(s, s.hr.id);
  const attempts = {
    'redefinir senha': () => auth.resetPassword(s.admin.id, 'SenhaDoInvasor12', actor, 'x'),
    'alterar dados/perfil': () =>
      auth.updateUser(
        s.admin.id,
        { name: 'Outro nome', email: 'admin@x.test', profileBase: 'ADMIN', active: true },
        actor
      ),
    'alterar permissões': () =>
      auth.setOverrides(s.admin.id, [{ permission: 'asset:read', effect: 'deny' }], actor),
    'alterar alcance': () => auth.setScopes(s.admin.id, [{ type: 'city', value: 'Recife' }], actor),
    'encerrar sessões': () => auth.forceLogout(s.admin.id, actor, 'x')
  };
  for (const [label, attempt] of Object.entries(attempts)) {
    await assert.rejects(Promise.resolve().then(attempt), { name: 'ForbiddenError' }, label);
  }
  const admin = userRow(s, s.admin.id);
  assert.equal(admin.name, 'Admin');
  assert.equal(admin.totp_enabled, 1, '2FA do admin intacto');
  assert.equal((await s.adminSession.get('/api/assets')).status, 200, 'sessão do admin intacta');
});

test('é impossível negar permissões ou restringir o alcance do admin', async (t) => {
  const s = await apiScenario(t);
  const self = await s.adminSession.put(`/api/users/${s.admin.id}/overrides`).send({
    overrides: [{ permission: 'asset:read', effect: 'deny' }],
    reason: 'Tentativa registrada'
  });
  assert.equal(self.status, 403);

  override(s, s.admin.id, '*:*', 'deny');
  override(s, s.admin.id, 'asset:read', 'deny');
  s.db
    .prepare("INSERT INTO user_scopes(user_id,scope_type,scope_value) VALUES(?,'city','Recife')")
    .run(s.admin.id);
  s.asset('BACKUP', 'EM-MANAUS', { city: 'Manaus' });
  const assets = await s.adminSession.get('/api/assets');
  assert.equal(assets.status, 200, JSON.stringify(assets.body));
  assert.equal(assets.body.total, 1, 'o alcance gravado no banco não restringe o admin');
  const me = await s.adminSession.get('/api/auth/me');
  assert.deepEqual(me.body.permissions, { granted: ['*:*'], denied: [] });
});

test('ninguém concede permissão que não possui, nem coringas ou desconhecidas', async (t) => {
  const s = await apiScenario(t);
  const { auth } = services(s);
  const hrActor = userRow(s, s.hr.id);
  const target = await s.createUser({ name: 'Alvo', email: 'alvo@x.test', profile: 'CONSULTA' });

  assert.throws(
    () => auth.setOverrides(target.id, [{ permission: 'asset:create', effect: 'allow' }], hrActor),
    { name: 'ForbiddenError', message: /não possui/ }
  );
  assert.throws(
    () =>
      auth.updateUser(
        target.id,
        { name: 'Alvo', email: 'alvo@x.test', profileBase: 'FINANCEIRO', active: true },
        hrActor
      ),
    { name: 'ForbiddenError', message: /não possui/ }
  );
  for (const permission of ['*:*', 'asset:*', 'inventado:tudo']) {
    const response = await s.adminSession
      .put(`/api/users/${target.id}/overrides`)
      .send({ overrides: [{ permission, effect: 'allow' }], reason: 'Tentativa registrada' });
    assert.equal(response.status, 400, `${permission}: ${JSON.stringify(response.body)}`);
    assert.match(response.body.error.message, /Permissão desconhecida/);
  }
  const allowed = await s.adminSession.put(`/api/users/${target.id}/overrides`).send({
    overrides: [{ permission: 'asset:view_value', effect: 'allow' }],
    reason: 'Financeiro'
  });
  assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
});
