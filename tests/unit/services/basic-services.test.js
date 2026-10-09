const test = require('node:test');
const assert = require('node:assert/strict');
const { createAssetsService } = require('../../../src/modules/assets/assets.service');
const { createEmployeesService } = require('../../../src/modules/employees/employees.service');
const {
  createAssignmentsService
} = require('../../../src/modules/assignments/assignments.service');
const { createTicketsService } = require('../../../src/modules/tickets/tickets.service');
const { createDashboardService } = require('../../../src/modules/dashboard/dashboard.service');
const { createAuditService } = require('../../../src/modules/audit/audit.service');
const { ASSET_STATES } = require('../../../src/modules/assets/domain/asset-state-machine');

const db = {
  transaction:
    (work) =>
    (...args) =>
      work(...args)
};
const user = { id: 7, name: 'Tecnico', profile_base: 'TECNICO' };

function auth() {
  return {
    scopes: () => [],
    assertScope() {},
    filterByScope: (_user, rows) => rows
  };
}

test('servico de ativos valida, cria, edita, pagina e audita', () => {
  const calls = [];
  const rows = [{ id: 1, equipment_type: 'Notebook', city: 'São Paulo', serial: 'A' }];
  const repository = {
    list: () => ({ items: rows, total: 1 }),
    findById: (id) => (Number(id) === 1 ? rows[0] : null),
    create: (input) => {
      calls.push(['create', input]);
      return 9;
    },
    update: (id, input) => calls.push(['update', id, input])
  };
  const audit = { logUser: (...args) => calls.push(['audit', ...args]) };
  const service = createAssetsService(db, repository, audit, auth());
  assert.equal(service.list({ page: 1, pageSize: 25 }, user).total, 1);
  assert.equal(service.get(1, user).serial, 'A');
  assert.throws(() => service.get(2, user), /n.o encontrado/);
  assert.throws(() => service.create({}, user), /obrigat.rio/);
  assert.deepEqual(service.create({ equipment_type: ' Notebook ', serial: ' S-1 ' }, user), {
    id: 9
  });
  assert.equal(calls[0][1].status, ASSET_STATES.AVAILABLE);
  assert.deepEqual(service.update(1, { model: 'M2' }, user), { ok: true });
  assert.equal(
    calls.some((call) => call[0] === 'update'),
    true
  );
  assert.throws(() => service.update(2, {}, user), /n.o encontrado/);
  const duplicate = createAssetsService(
    db,
    {
      ...repository,
      create: () => {
        throw Object.assign(new Error('UNIQUE'), { code: 'SQLITE_CONSTRAINT' });
      }
    },
    audit,
    auth()
  );
  assert.throws(() => duplicate.create({ equipment_type: 'Notebook' }, user), /J. existe/);
});

test('servico de funcionarios mascara dados, impede duplicidade e preserva regras de desligamento', () => {
  const employee = {
    id: 1,
    code: 'F1',
    name: 'Pessoa',
    email: 'pessoa@example.test',
    city: 'São Paulo',
    department: 'TI',
    personal_phone: '11999999999',
    corporate_phone: '1133333333',
    status: 'ativo',
    hire_date: null,
    offboarded_at: null
  };
  const changes = [];
  const repository = {
    list: () => ({ items: [employee], total: 1 }),
    findById: (id) => (Number(id) === 1 ? employee : null),
    findCodeDuplicate: (code) => (code === 'DUP' ? { id: 8 } : null),
    create: () => 2,
    update: (_id, value) => changes.push(value)
  };
  const service = createEmployeesService(db, repository, { logUser() {} }, auth());
  const consultation = { ...user, profile_base: 'CONSULTA' };
  assert.equal(
    service.list({ page: 1, pageSize: 25 }, consultation).items[0].email,
    'pe***@example.test'
  );
  assert.equal(service.get(1, consultation).personal_phone, null);
  assert.throws(() => service.create({ name: '' }, user), /Nome/);
  assert.throws(() => service.create({ name: 'Pessoa', code: 'DUP' }, user), /C.digo/);
  assert.deepEqual(service.create({ name: 'Nova', code: 'F2' }, user), { id: 2 });
  assert.throws(() => service.update(1, { status: 'desligado' }, user), /desligamento/);
  assert.throws(() => service.update(1, { offboarded_at: '2026-01-01' }, user), /s. pode/);
  assert.deepEqual(service.update(1, { department: 'RH' }, user), { ok: true });
  assert.equal(changes[0].department, 'RH');
});

test('servicos de atribuicoes, chamados, painel e auditoria aplicam suas regras', () => {
  const events = [];
  const assignments = createAssignmentsService(
    db,
    {
      listEmployeeAssets: () => [{ id: 3 }],
      listForOffboard: () => [{ id: 3, status: ASSET_STATES.IN_USE }]
    },
    {
      findById: () => ({ id: 1, status: 'active', city: 'São Paulo' }),
      markInactive: () => events.push('inactive')
    },
    { normalizeState: (value) => value, performMove: () => events.push('move') },
    { logUser: () => events.push('audit') },
    auth()
  );
  assert.equal(assignments.listEmployeeAssets(1, user).length, 1);
  assert.deepEqual(assignments.offboard(1, { 3: { status: ASSET_STATES.BACKUP } }, user), {
    ok: true,
    moved: 1
  });
  assert.deepEqual(events, ['move', 'inactive', 'audit']);

  const tickets = createTicketsService(
    db,
    { list: () => ({ items: [], total: 0 }), create: () => 5 },
    { logUser: () => events.push('ticket') },
    { findActiveById: () => ({ id: 1, city: 'São Paulo' }) },
    auth()
  );
  assert.throws(() => tickets.create({ employee_id: 1 }, user), /obrigat.rios/);
  assert.equal(tickets.list({ page: 1, pageSize: 25 }, user).total, 0);
  assert.equal(tickets.create({ employee_id: 1, description: 'Teste' }, user).id, 5);

  const dashboard = createDashboardService({
    summary: () => ({ assets: 1 }),
    report: (filters) => filters
  });
  assert.equal(dashboard.summary().assets, 1);
  assert.equal(dashboard.report({ year: '2026', month: '10' }).year, '2026');
  assert.throws(() => dashboard.report({ year: '20' }), /Ano/);
  assert.throws(() => dashboard.report({ month: '13' }), /M.s/);
  assert.throws(() => dashboard.report({ assetStatus: 'INVALIDO' }), /ativo/);

  const auditCalls = [];
  const audit = createAuditService({
    log: (...args) => auditCalls.push(args),
    list: () => ({ items: [], total: 0 })
  });
  audit.log('ator', 'acao', 'ativo', 1, { changed: true });
  audit.logUser(user, 'acao', 'ativo', 1, {});
  assert.equal(auditCalls.length, 2);
  assert.equal(audit.list({ page: 1, pageSize: 25 }).total, 0);
});
