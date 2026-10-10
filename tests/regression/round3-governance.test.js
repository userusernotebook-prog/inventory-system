const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { apiScenario } = require('../helpers/regression-scenario');
const { migrate } = require('../../src/db/migrate');
const { anonymizeOffboardedEmployees } = require('../../scripts/anonymize-offboarded');

test('R3: motivo administrativo e obrigatorio na API', async (t) => {
  const s = await apiScenario(t);
  const update = await s.adminSession.put(`/api/users/${s.hr.id}`).send({
    name: s.hr.name,
    email: s.hr.email,
    profile_base: 'RH',
    active: true
  });
  assert.equal(update.status, 400, JSON.stringify(update.body));
  assert.ok(update.body.error.details.some((issue) => issue.path === 'reason'));

  const password = await s.adminSession.post(`/api/users/${s.hr.id}/reset-password`).send({
    password: 'NovaSenhaProvisoria1'
  });
  assert.equal(password.status, 400, JSON.stringify(password.body));
  assert.ok(password.body.error.details.some((issue) => issue.path === 'reason'));
});

test('R3: payload duplicado nao apaga overrides ou alcance existentes', async (t) => {
  const s = await apiScenario(t);
  const beforeOverrides = [{ permission: 'asset:read', effect: 'deny' }];
  const beforeScopes = [{ type: 'city', value: 'São Paulo' }];
  assert.equal(
    (
      await s.adminSession
        .put(`/api/users/${s.hr.id}/overrides`)
        .send({ overrides: beforeOverrides, reason: 'Restringir a leitura de ativos.' })
    ).status,
    200
  );
  assert.equal(
    (
      await s.adminSession
        .put(`/api/users/${s.hr.id}/scopes`)
        .send({ scopes: beforeScopes, reason: 'Definir cidade de atendimento.' })
    ).status,
    200
  );

  const duplicateOverride = await s.adminSession.put(`/api/users/${s.hr.id}/overrides`).send({
    overrides: [
      { permission: 'asset:read', effect: 'allow' },
      { permission: 'asset:read', effect: 'deny' }
    ],
    reason: 'Tentativa invalida de duplicidade.'
  });
  assert.equal(duplicateOverride.status, 400, JSON.stringify(duplicateOverride.body));
  assert.match(duplicateOverride.body.error.message, /repetida/i);

  const duplicateScope = await s.adminSession.put(`/api/users/${s.hr.id}/scopes`).send({
    scopes: [
      { type: 'city', value: 'São Paulo' },
      { type: 'city', value: 'são paulo' }
    ],
    reason: 'Tentativa invalida de duplicidade.'
  });
  assert.equal(duplicateScope.status, 400, JSON.stringify(duplicateScope.body));
  assert.match(duplicateScope.body.error.message, /Alcance repetido/);

  assert.deepEqual(
    s.db
      .prepare('SELECT permission,effect FROM user_permission_overrides WHERE user_id=?')
      .all(s.hr.id),
    beforeOverrides
  );
  assert.deepEqual(
    s.db
      .prepare('SELECT scope_type AS type,scope_value AS value FROM user_scopes WHERE user_id=?')
      .all(s.hr.id),
    beforeScopes
  );
});

test('R3: filtro active=false devolve somente usuarios inativos', async (t) => {
  const s = await apiScenario(t);
  const deactivated = await s.adminSession.put(`/api/users/${s.hr.id}`).send({
    name: s.hr.name,
    email: s.hr.email,
    profile_base: 'RH',
    active: false,
    reason: 'Desativacao para validar o filtro.'
  });
  assert.equal(deactivated.status, 200, JSON.stringify(deactivated.body));

  const listed = await s.adminSession.get('/api/users?active=false');
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  assert.ok(listed.body.items.some((user) => user.id === s.hr.id));
  assert.ok(listed.body.items.every((user) => Number(user.active) === 0));
});

test('R3: funcionario em desligamento ou desligado nao pode ser editado', async (t) => {
  const s = await apiScenario(t);
  for (const status of ['em_desligamento', 'desligado']) {
    const id = s.employee(`Pessoa ${status}`, { status });
    const response = await s.hrSession.put(`/api/employees/${id}`).send({
      name: 'Tentativa de alterar telefone',
      corporate_phone: '11999999999'
    });
    assert.equal(response.status, 409, JSON.stringify(response.body));
    assert.equal(
      response.body.error.message,
      'Funcionário em processo de desligamento: dados bloqueados'
    );
  }
});

test('R3: anonimizacao inclui desligado sem e-mail', () => {
  const db = new Database(':memory:');
  try {
    migrate(db);
    const id = Number(
      db
        .prepare(
          "INSERT INTO employees(name,email,status,offboarded_at,city,code) VALUES(?,NULL,'desligado',?,?,?)"
        )
        .run('Pessoa sem email', '2020-01-01T00:00:00.000Z', 'São Paulo', 'LEG-001')
        .lastInsertRowid
    );
    assert.equal(anonymizeOffboardedEmployees(db, 30, new Date('2026-01-01T00:00:00.000Z')), 1);
    const employee = db.prepare('SELECT name,email,city,code FROM employees WHERE id=?').get(id);
    assert.match(employee.name, /^Funcionário anonimizado #/);
    assert.equal(employee.email, null);
    assert.equal(employee.city, null);
    assert.equal(employee.code, null);
  } finally {
    db.close();
  }
});
