const assert = require('node:assert/strict');
const request = require('supertest');
const { generate } = require('otplib');
const { createApp } = require('../../src/app');
const { createIntegrationContext, createUser, login } = require('./integration-context');

const password = 'SenhaDeTesteForte1';
const totpSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

// Cenário de API com admin (2FA), técnico e RH, banco em memória e helpers de dados.
async function apiScenario(t) {
  const context = createIntegrationContext();
  t.after(() => context.close());
  const { db } = context;
  const app = createApp(db);
  const admin = await createUser(db, { name: 'Admin', email: 'admin@x.test', profile: 'ADMIN' });
  db.prepare('UPDATE users SET totp_secret=?,totp_enabled=1 WHERE id=?').run(totpSecret, admin.id);
  const technician = await createUser(db, {
    name: 'Tecnico',
    email: 'tecnico@x.test',
    profile: 'TECNICO'
  });
  const hr = await createUser(db, { name: 'RH', email: 'rh@x.test', profile: 'RH' });

  async function sessionFor(user) {
    const session = request.agent(app);
    let code = user.profile === 'ADMIN' ? await generate({ secret: totpSecret }) : undefined;
    let response = await login(session, user.email, password, code);
    // O código pode vencer entre a geração e a requisição quando o teste começa
    // no limite de uma janela TOTP de 30 segundos. Uma única nova tentativa
    // preserva a validação real sem tornar a suíte intermitente.
    if (user.profile === 'ADMIN' && response.status === 401) {
      code = await generate({ secret: totpSecret });
      response = await login(session, user.email, password, code);
    }
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return session;
  }
  const employee = (name, values = {}) =>
    Number(
      db
        .prepare('INSERT INTO employees(name,status,city,department,code) VALUES(?,?,?,?,?)')
        .run(
          name,
          values.status || 'ativo',
          values.city || null,
          values.department || null,
          values.code || null
        ).lastInsertRowid
    );
  const asset = (status, serial, values = {}) =>
    Number(
      db
        .prepare(
          'INSERT INTO assets(equipment_type,serial,status,city,hostname,acquisition_value) VALUES(?,?,?,?,?,?)'
        )
        .run(
          values.type || 'Notebook',
          serial,
          status,
          values.city || null,
          values.hostname || null,
          values.value ?? null
        ).lastInsertRowid
    );
  const assign = (assetId, employeeId) =>
    db
      .prepare('INSERT INTO assignments(asset_id,employee_id,responsible_user_id) VALUES(?,?,?)')
      .run(assetId, employeeId, technician.id);
  const status = (assetId) =>
    db.prepare('SELECT status FROM assets WHERE id=?').get(assetId).status;
  const holder = (assetId) =>
    db
      .prepare('SELECT employee_id FROM assignments WHERE asset_id=? AND returned_at IS NULL')
      .get(assetId)?.employee_id ?? null;

  return {
    db,
    app,
    admin,
    technician,
    hr,
    createUser: (values) => createUser(db, values),
    sessionFor,
    adminSession: await sessionFor(admin),
    technicianSession: await sessionFor(technician),
    hrSession: await sessionFor(hr),
    employee,
    asset,
    assign,
    status,
    holder
  };
}

module.exports = { apiScenario, password };
