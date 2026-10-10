// Rodada 1, item 4 (regra R1): BACKUP só chega a EM_USO com solicitação aprovada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');
const { generate } = require('otplib');
const {
  ASSET_STATES,
  TRANSITIONS
} = require('../../src/modules/assets/domain/asset-state-machine');
const { createIntegrationContext, createUser, login } = require('../helpers/integration-context');

const { AVAILABLE, IN_USE, BACKUP, UNDER_MAINTENANCE, UNDER_EVALUATION, RETURN_PENDING } =
  ASSET_STATES;
const password = 'SenhaDeTesteForte1';
const totpSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

// Todos os caminhos de BACKUP que usam apenas transições sem aprovação.
function pathsWithoutApproval(from, target) {
  const found = [];
  const walk = (state, trail) => {
    for (const rule of TRANSITIONS[state]) {
      if (rule.requiresApproval) continue;
      const next = [...trail, `${state} -[${rule.permission}]-> ${rule.to}`];
      if (rule.to === target) found.push(next.join(' | '));
      else if (!trail.some((step) => step.startsWith(`${rule.to} `)) && rule.to !== from)
        walk(rule.to, next);
    }
  };
  walk(from, []);
  return found;
}

test('grafo: nenhum caminho de BACKUP até EM_USO dispensa aprovação', () => {
  assert.deepEqual(pathsWithoutApproval(BACKUP, IN_USE), []);
});

test('grafo: DISPONIVEL só existe na criação e só ele vai a EM_USO sem aprovação', () => {
  const intoAvailable = Object.entries(TRANSITIONS).flatMap(([from, rules]) =>
    rules.filter((rule) => rule.to === AVAILABLE).map((rule) => `${from} -> ${rule.to}`)
  );
  assert.deepEqual(intoAvailable, [], 'nenhuma transição pode levar a DISPONIVEL');

  const freeIntoInUse = Object.entries(TRANSITIONS).flatMap(([from, rules]) =>
    rules.filter((rule) => rule.to === IN_USE && !rule.requiresApproval).map(() => from)
  );
  assert.deepEqual(freeIntoInUse, [AVAILABLE]);

  for (const state of [UNDER_MAINTENANCE, UNDER_EVALUATION, RETURN_PENDING]) {
    const targets = TRANSITIONS[state].filter((rule) => !rule.requiresApproval).map((r) => r.to);
    assert.ok(!targets.includes(AVAILABLE), `${state} não pode voltar para DISPONIVEL`);
    assert.ok(!targets.includes(IN_USE), `${state} não pode ir direto para EM_USO`);
  }
  for (const state of [UNDER_MAINTENANCE, UNDER_EVALUATION]) {
    const targets = TRANSITIONS[state].filter((rule) => !rule.requiresApproval).map((r) => r.to);
    assert.ok(targets.includes(BACKUP), `${state} precisa voltar para BACKUP`);
  }
  // Rodada 2: a devolução passa obrigatoriamente pelo recebimento (EM_AVALIACAO)
  // e de lá segue para BACKUP.
  assert.deepEqual(
    TRANSITIONS[RETURN_PENDING].map((rule) => rule.to),
    [UNDER_EVALUATION]
  );
});

async function scenario(t) {
  const context = createIntegrationContext();
  t.after(() => context.close());
  const { db, agent } = context;
  const admin = await createUser(db, {
    name: 'Admin R1',
    email: 'admin.r1@example.test',
    profile: 'ADMIN'
  });
  db.prepare('UPDATE users SET totp_secret=?,totp_enabled=1 WHERE id=?').run(totpSecret, admin.id);
  const technician = await createUser(db, {
    name: 'Tecnico R1',
    email: 'tecnico.r1@example.test',
    profile: 'TECNICO'
  });
  const hr = await createUser(db, { name: 'RH R1', email: 'rh.r1@example.test', profile: 'RH' });
  const request = require('supertest');
  const { createApp } = require('../../src/app');
  const app = createApp(db);
  const as = async (user, code) => {
    const session = request.agent(app);
    const response = await login(session, user.email, password, code);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return session;
  };
  const employee = (name, status = 'ativo') =>
    Number(
      db.prepare('INSERT INTO employees(name,status) VALUES(?,?)').run(name, status).lastInsertRowid
    );
  const asset = (status, serial) =>
    Number(
      db
        .prepare("INSERT INTO assets(equipment_type,serial,status) VALUES('Notebook',?,?)")
        .run(serial, status).lastInsertRowid
    );
  const assign = (assetId, employeeId) =>
    db
      .prepare('INSERT INTO assignments(asset_id,employee_id,responsible_user_id) VALUES(?,?,?)')
      .run(assetId, employeeId, technician.id);
  const status = (assetId) =>
    db.prepare('SELECT status FROM assets WHERE id=?').get(assetId).status;
  return {
    db,
    agent,
    adminSession: await as(admin, await generate({ secret: totpSecret })),
    technicianSession: await as(technician),
    hrSession: await as(hr),
    employee,
    asset,
    assign,
    status
  };
}

test('/move: nenhum perfil leva BACKUP a EM_USO, nem em dois passos', async (t) => {
  const s = await scenario(t);
  const person = s.employee('Pessoa');
  for (const session of [s.technicianSession, s.adminSession]) {
    const backup = s.asset(BACKUP, `MOVE-${Math.random()}`);
    const direct = await session.post(`/api/assets/${backup}/move`).send({
      to_status: IN_USE,
      employee_id: person
    });
    assert.equal(direct.status, 400, JSON.stringify(direct.body));
    const toAvailable = await session.post(`/api/assets/${backup}/move`).send({
      to_status: AVAILABLE
    });
    assert.equal(
      toAvailable.status,
      400,
      `BACKUP -> DISPONIVEL: ${JSON.stringify(toAvailable.body)}`
    );

    const viaMaintenance = await session.post(`/api/assets/${backup}/move`).send({
      to_status: UNDER_MAINTENANCE,
      reason: 'Troca de tela'
    });
    assert.equal(viaMaintenance.status, 200, JSON.stringify(viaMaintenance.body));
    const repaired = await session.post(`/api/assets/${backup}/move`).send({
      to_status: AVAILABLE
    });
    assert.equal(
      repaired.status,
      400,
      `EM_MANUTENCAO -> DISPONIVEL: ${JSON.stringify(repaired.body)}`
    );
    assert.equal(s.status(backup), UNDER_MAINTENANCE);
  }

  const evaluated = s.asset(UNDER_EVALUATION, 'MOVE-EVAL');
  const released = await s.adminSession.post(`/api/assets/${evaluated}/move`).send({
    to_status: AVAILABLE
  });
  assert.equal(
    released.status,
    400,
    `EM_AVALIACAO -> DISPONIVEL: ${JSON.stringify(released.body)}`
  );

  const fresh = s.asset(AVAILABLE, 'MOVE-NOVO');
  const assigned = await s.technicianSession.post(`/api/assets/${fresh}/move`).send({
    to_status: IN_USE,
    employee_id: person
  });
  assert.equal(assigned.status, 200, 'estoque novo continua sendo atribuído sem aprovação');
});

test('aprovação do admin é o único caminho de BACKUP a EM_USO', async (t) => {
  const s = await scenario(t);
  const person = s.employee('Pessoa');
  const backup = s.asset(BACKUP, 'APROVADO-1');
  const created = await s.technicianSession.post('/api/approval-requests').send({
    type: 'USO_EQUIPAMENTO_BACKUP',
    asset_id: backup,
    employee_id: person,
    justification: 'Notebook do funcionário quebrou'
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(s.status(backup), BACKUP, 'a solicitação pendente não atribui o ativo');
  const approved = await s.adminSession
    .post(`/api/approval-requests/${created.body.id}/approve`)
    .send({});
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(s.status(backup), IN_USE);
});

test('troca: ativo antigo vai para avaliação e não volta a DISPONIVEL', async (t) => {
  const s = await scenario(t);
  const person = s.employee('Pessoa');
  const old = s.asset(IN_USE, 'TROCA-ANTIGO');
  s.assign(old, person);
  const replacement = s.asset(BACKUP, 'TROCA-NOVO');
  const created = await s.technicianSession.post('/api/approval-requests').send({
    type: 'TROCA_EQUIPAMENTO',
    employee_id: person,
    old_asset_id: old,
    new_asset_id: replacement,
    justification: 'Equipamento antigo com defeito'
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(s.status(replacement), BACKUP, 'a troca pendente não atribui o novo ativo');
  const approved = await s.adminSession
    .post(`/api/approval-requests/${created.body.id}/approve`)
    .send({});
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(s.status(old), UNDER_EVALUATION);

  const released = await s.adminSession.post(`/api/assets/${old}/move`).send({
    to_status: AVAILABLE
  });
  assert.equal(released.status, 400, JSON.stringify(released.body));
  const toBackup = await s.technicianSession.post(`/api/assets/${old}/move`).send({
    to_status: BACKUP
  });
  assert.equal(toBackup.status, 200, JSON.stringify(toBackup.body));
});

test('desligamento: ativo devolvido não é reatribuído nem liberado sem aprovação', async (t) => {
  const s = await scenario(t);
  const leaving = s.employee('Saindo');
  const other = s.employee('Outra pessoa');
  const laptop = s.asset(IN_USE, 'DESLIG-1');
  s.assign(laptop, leaving);
  const started = await s.hrSession.post(`/api/employees/${leaving}/offboarding/start`).send({
    offboarding_date: '2026-10-31',
    reason: 'Pedido de demissão'
  });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  assert.equal(s.status(laptop), RETURN_PENDING);

  for (const body of [{ to_status: IN_USE, employee_id: other }, { to_status: AVAILABLE }]) {
    const shortcut = await s.technicianSession.post(`/api/assets/${laptop}/move`).send(body);
    assert.equal(
      shortcut.status,
      400,
      `PENDENTE_DEVOLUCAO -> ${body.to_status}: ${JSON.stringify(shortcut.body)}`
    );
  }

  const received = await s.technicianSession
    .post(`/api/offboarding/assets/${laptop}/receive`)
    .send({ physical_condition: 'Bom estado', accessories: 'Carregador' });
  assert.equal(received.status, 200, JSON.stringify(received.body));
  const toAvailable = await s.technicianSession
    .post(`/api/offboarding/assets/${laptop}/destination`)
    .send({ destination: AVAILABLE, justification: 'Liberar' });
  assert.equal(toAvailable.status, 400);
  const toBackup = await s.technicianSession
    .post(`/api/offboarding/assets/${laptop}/destination`)
    .send({ destination: BACKUP, justification: 'Volta para o estoque de backup' });
  assert.equal(toBackup.status, 200, JSON.stringify(toBackup.body));

  const reassign = await s.technicianSession.post(`/api/assets/${laptop}/move`).send({
    to_status: IN_USE,
    employee_id: other
  });
  assert.equal(reassign.status, 400);
  assert.equal(s.status(laptop), BACKUP);
});

test('importação não move um ativo existente de BACKUP para EM_USO', async (t) => {
  const s = await scenario(t);
  const backup = s.asset(BACKUP, 'IMPORT-BACKUP');
  s.db
    .prepare("INSERT INTO employees(code,name,status) VALUES('F9','Pessoa Importada','ativo')")
    .run();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'r1-import-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const template = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    template,
    XLSX.utils.aoa_to_sheet([['CÓDIGO', 'NOME', 'STATUS']]),
    'Funcionarios'
  );
  XLSX.utils.book_append_sheet(
    template,
    XLSX.utils.aoa_to_sheet([
      ['CÓDIGO FUNCIONÁRIO', 'EQUIPAMENTO', 'SERIAL', 'REFERÊNCIA', 'STATUS'],
      ['F9', 'Notebook', 'IMPORT-BACKUP', '', 'Em uso']
    ]),
    'Ativos'
  );
  const templateFile = path.join(directory, 'modelo.xlsx');
  XLSX.writeFile(template, templateFile);
  const imported = await s.technicianSession.post('/api/import/excel').attach('file', templateFile);
  assert.equal(imported.status, 400, JSON.stringify(imported.body));

  const legacy = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    legacy,
    XLSX.utils.aoa_to_sheet([
      ['FUNCIONARIO', 'EQUIPAMENTO', 'SERIAL'],
      ['Pessoa Importada', 'Notebook', 'IMPORT-BACKUP']
    ]),
    'controle máquinas_Uso'
  );
  const legacyFile = path.join(directory, 'legado.xlsx');
  XLSX.writeFile(legacy, legacyFile);
  // A planilha legada é carga inicial (import:initial_load, só ADMIN por padrão).
  const legacyImport = await s.adminSession.post('/api/import/excel').attach('file', legacyFile);
  assert.equal(legacyImport.status, 200, JSON.stringify(legacyImport.body));

  assert.equal(s.status(backup), BACKUP);
  assert.equal(
    s.db.prepare('SELECT COUNT(*) n FROM assignments WHERE asset_id=?').get(backup).n,
    0
  );
});

test('migration 013 devolve a BACKUP os ativos usados que estavam em DISPONIVEL', async (t) => {
  const s = await scenario(t);
  const person = s.employee('Pessoa');
  const returned = s.asset(AVAILABLE, 'R1-DEVOLVIDO');
  s.db
    .prepare(
      'INSERT INTO assignments(asset_id,employee_id,responsible_user_id,assigned_at,returned_at) VALUES(?,?,NULL,?,?)'
    )
    .run(returned, person, '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
  const repaired = s.asset(AVAILABLE, 'R1-REPARADO');
  s.db
    .prepare(
      "INSERT INTO movements(asset_id,from_status,to_status,movement_type,occurred_at) VALUES(?,'DISPONIVEL','EM_MANUTENCAO','ENVIO_MANUTENCAO','2026-01-01T00:00:00.000Z')"
    )
    .run(repaired);
  const brandNew = s.asset(AVAILABLE, 'R1-NOVO');

  const sql = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'db', 'migrations', '013_r1_used_assets_to_backup.sql'),
    'utf8'
  );
  s.db.exec(sql);

  assert.equal(s.status(returned), BACKUP);
  assert.equal(s.status(repaired), BACKUP);
  assert.equal(s.status(brandNew), AVAILABLE);
  const recorded = s.db
    .prepare("SELECT asset_id FROM movements WHERE to_status='BACKUP' ORDER BY asset_id")
    .all()
    .map((row) => row.asset_id);
  assert.deepEqual(recorded, [returned, repaired]);
});
