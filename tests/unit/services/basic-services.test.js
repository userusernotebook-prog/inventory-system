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

function auth(overrides = {}) {
  return {
    scopes: () => [],
    assertScope() {},
    filterByScope: (_user, rows) => rows,
    can: () => false,
    ...overrides
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
  assert.throws(() => service.get(2, user), /não encontrado/);
  assert.throws(() => service.create({}, user), /obrigatório/);
  assert.deepEqual(service.create({ equipment_type: ' Notebook ', serial: ' S-1 ' }, user), {
    id: 9
  });
  assert.equal(calls[0][1].status, ASSET_STATES.AVAILABLE);
  assert.deepEqual(service.update(1, { model: 'M2' }, user), { ok: true });
  assert.throws(() => service.update(2, {}, user), /não encontrado/);
});

test('servico de funcionarios mascara dados, impede duplicidade e preserva regras', () => {
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
  assert.throws(() => service.create({ name: 'Pessoa', code: 'DUP' }, user), /Código/);
  assert.deepEqual(service.create({ name: 'Nova', code: 'F2', hire_date: '' }, user), { id: 2 });
  assert.throws(() => service.update(1, { status: 'desligado' }, user), /desligamento/);
  assert.deepEqual(service.update(1, { department: 'RH' }, user), { ok: true });
  assert.equal(changes[0].department, 'RH');
});

test('atribuicoes respeitam alcance e mascara valores sem permissao', () => {
  const asset = { id: 3, acquisition_value: 900, serial: 'A-3' };
  const repository = { listEmployeeAssets: () => [asset] };
  const employeeRepository = { findById: () => ({ id: 1, city: 'São Paulo' }) };
  const hidden = createAssignmentsService(repository, employeeRepository, auth());
  assert.deepEqual(hidden.listEmployeeAssets(1, user), [{ id: 3, serial: 'A-3' }]);

  const visible = createAssignmentsService(
    repository,
    employeeRepository,
    auth({ can: (_actor, permission) => permission === 'asset:view_value' })
  );
  assert.deepEqual(visible.listEmployeeAssets(1, user), [asset]);

  const absent = createAssignmentsService(repository, { findById: () => null }, auth());
  assert.throws(() => absent.listEmployeeAssets(1, user), /Funcionário não encontrado/);

  const outOfScope = createAssignmentsService(
    repository,
    { findById: (_id, scopes) => (scopes ? null : { id: 1 }) },
    auth({ scopes: () => [{ scope_type: 'city', scope_value: 'Recife' }] })
  );
  assert.throws(() => outOfScope.listEmployeeAssets(1, user), /alcance/);
});

test('servicos de chamados, painel e auditoria aplicam suas regras', () => {
  const tickets = createTicketsService(
    db,
    { list: () => ({ items: [], total: 0 }), create: () => 5 },
    { logUser() {} },
    { findActiveById: () => ({ id: 1, city: 'São Paulo' }) },
    auth()
  );
  assert.throws(() => tickets.create({ employee_id: 1 }, user), /obrigatórios/);
  assert.equal(tickets.list({ page: 1, pageSize: 25 }, user).total, 0);
  assert.equal(tickets.create({ employee_id: 1, description: 'Teste' }, user).id, 5);

  const dashboard = createDashboardService(
    {
      summary: (scopes, visibility) => ({ assets: 1, scopes, visibility }),
      report: (filters) => filters
    },
    { scopes: () => [], can: (_actor, permission) => permission === 'employee:read' }
  );
  assert.equal(dashboard.summary(user).assets, 1);
  assert.deepEqual(dashboard.summary(user).visibility, { employees: true, tickets: false });
  assert.equal(dashboard.report({ year: '2026', month: '10' }, user).year, '2026');
  assert.throws(() => dashboard.report({ year: '20' }, user), /Ano/);

  const calls = [];
  const audit = createAuditService({
    log: (...args) => calls.push(args),
    list: () => ({ items: [], total: 0 })
  });
  audit.log('ator', 'acao', 'ativo', 1, { changed: true });
  audit.logUser(user, 'acao', 'ativo', 1, {});
  assert.equal(calls.length, 2);
  assert.equal(audit.list({ page: 1, pageSize: 25 }).total, 0);
});
