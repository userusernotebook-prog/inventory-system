const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { migrate } = require('../../../src/db/migrate');
const { createAuthRepository } = require('../../../src/modules/auth/auth.repository');
const { createAuthService } = require('../../../src/modules/auth/auth.service');
const { createAssetsRepository } = require('../../../src/modules/assets/assets.repository');
const {
  createEmployeesRepository
} = require('../../../src/modules/employees/employees.repository');
const {
  createAssignmentsRepository
} = require('../../../src/modules/assignments/assignments.repository');
const {
  createMovementsRepository
} = require('../../../src/modules/movements/movements.repository');
const { createMovementsService } = require('../../../src/modules/movements/movements.service');
const {
  createApprovalsRepository
} = require('../../../src/modules/approvals/approvals.repository');
const { createApprovalsService } = require('../../../src/modules/approvals/approvals.service');
const {
  createOffboardingRepository
} = require('../../../src/modules/offboarding/offboarding.repository');
const {
  createOffboardingService
} = require('../../../src/modules/offboarding/offboarding.service');
const { ASSET_STATES } = require('../../../src/modules/assets/domain/asset-state-machine');

function setup() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  const insertUser = db.prepare(
    'INSERT INTO users(name,email,password_hash,profile_base,must_change_password) VALUES(?,?,? ,?,0)'
  );
  const adminId = insertUser.run('Admin', 'admin@test', 'x', 'ADMIN').lastInsertRowid;
  const rhId = insertUser.run('RH', 'rh@test', 'x', 'RH').lastInsertRowid;
  const techId = insertUser.run('Técnico', 'tech@test', 'x', 'TECNICO').lastInsertRowid;
  const financialId = insertUser.run('Financeiro', 'fin@test', 'x', 'FINANCEIRO').lastInsertRowid;
  const employeeId = db
    .prepare("INSERT INTO employees(name,status) VALUES('Pessoa','ativo')")
    .run().lastInsertRowid;
  const authRepo = createAuthRepository(db);
  const audit = { logUser() {} };
  const auth = createAuthService(authRepo, audit);
  const assets = createAssetsRepository(db);
  const employees = createEmployeesRepository(db);
  const assignments = createAssignmentsRepository(db);
  const moves = createMovementsService(
    db,
    assets,
    employees,
    assignments,
    createMovementsRepository(db),
    audit,
    auth
  );
  const approvals = createApprovalsService(
    db,
    createApprovalsRepository(db),
    assets,
    employees,
    moves,
    audit,
    auth
  );
  const offboarding = createOffboardingService(
    db,
    createOffboardingRepository(db),
    employees,
    assets,
    assignments,
    moves,
    approvals,
    audit,
    auth
  );
  const asset = db
    .prepare("INSERT INTO assets(equipment_type,serial,status) VALUES('Notebook',?,'EM_USO')")
    .run('OFF-1').lastInsertRowid;
  db.prepare('INSERT INTO assignments(asset_id,employee_id,responsible_user_id) VALUES(?,?,?)').run(
    asset,
    employeeId,
    techId
  );
  return {
    db,
    offboarding,
    approvals,
    employeeId,
    asset,
    admin: authRepo.findById(adminId),
    rh: authRepo.findById(rhId),
    tech: authRepo.findById(techId),
    financial: authRepo.findById(financialId)
  };
}

test('desligamento segue as quatro etapas e bloqueia perfis sem permissão', () => {
  const ctx = setup();
  try {
    assert.throws(
      () =>
        ctx.offboarding.start(
          ctx.employeeId,
          { offboarding_date: '2026-10-10', reason: 'Saída' },
          ctx.tech
        ),
      /permissão/
    );
    assert.throws(
      () =>
        ctx.offboarding.start(
          ctx.employeeId,
          { offboarding_date: '2026-10-10', reason: 'Saída' },
          ctx.financial
        ),
      /permissão/
    );
    assert.deepEqual(
      ctx.offboarding.start(
        ctx.employeeId,
        { offboarding_date: '2026-10-10', reason: 'Saída' },
        ctx.rh
      ),
      { ok: true, pending_assets: 1 }
    );
    assert.equal(
      ctx.db.prepare('SELECT status FROM employees WHERE id=?').get(ctx.employeeId).status,
      'em_desligamento'
    );
    assert.equal(
      ctx.db.prepare('SELECT status FROM assets WHERE id=?').get(ctx.asset).status,
      ASSET_STATES.RETURN_PENDING
    );
    const checklist = ctx.offboarding.checklist(ctx.employeeId, ctx.rh);
    assert.equal(checklist.pending, 1);
    assert.deepEqual(checklist.assets.map((item) => item.id), [Number(ctx.asset)]);
    assert.equal(checklist.assets[0].status, ASSET_STATES.RETURN_PENDING);
    assert.deepEqual(
      ctx.offboarding.receive(
        ctx.asset,
        { physical_condition: 'Bom', accessories: 'Carregador' },
        ctx.tech
      ),
      { ok: true }
    );
    assert.equal(
      ctx.db.prepare('SELECT status FROM assets WHERE id=?').get(ctx.asset).status,
      ASSET_STATES.UNDER_EVALUATION
    );
    assert.deepEqual(
      ctx.offboarding.destination(
        ctx.asset,
        { destination: 'BACKUP', justification: 'Disponível' },
        ctx.tech
      ),
      { ok: true }
    );
    const ticket = ctx.db
      .prepare("INSERT INTO tickets(employee_id,description,status) VALUES(?,'Aberto','open')")
      .run(ctx.employeeId).lastInsertRowid;
    assert.throws(() => ctx.offboarding.conclude(ctx.employeeId, {}, ctx.rh), /chamados abertos/);
    assert.deepEqual(
      ctx.offboarding.conclude(
        ctx.employeeId,
        { ticket_actions: [{ ticket_id: ticket, action: 'FECHAR' }] },
        ctx.rh
      ),
      { ok: true }
    );
    assert.equal(
      ctx.db.prepare('SELECT status FROM employees WHERE id=?').get(ctx.employeeId).status,
      'desligado'
    );
    assert.ok(
      ctx.db
        .prepare('SELECT COUNT(*) count FROM employee_events WHERE employee_id=?')
        .get(ctx.employeeId).count >= 4
    );
  } finally {
    ctx.db.close();
  }
});

test('desativação no desligamento aguarda aprovação antes da conclusão', () => {
  const ctx = setup();
  try {
    ctx.offboarding.start(
      ctx.employeeId,
      { offboarding_date: '2026-10-10', reason: 'Saída' },
      ctx.rh
    );
    ctx.offboarding.receive(ctx.asset, { physical_condition: 'Danificado' }, ctx.tech);
    const proposal = ctx.offboarding.destination(
      ctx.asset,
      {
        destination: 'DESATIVADO',
        justification: 'Sem reparo',
        technical_report: 'Placa defeituosa'
      },
      ctx.tech
    );
    assert.throws(
      () => ctx.offboarding.conclude(ctx.employeeId, {}, ctx.rh),
      /desativação pendente/
    );
    ctx.approvals.approve(proposal.approval_request_id, ctx.admin);
    assert.deepEqual(ctx.offboarding.conclude(ctx.employeeId, {}, ctx.rh), { ok: true });
    assert.equal(
      ctx.db.prepare('SELECT status FROM assets WHERE id=?').get(ctx.asset).status,
      ASSET_STATES.DEACTIVATED
    );
  } finally {
    ctx.db.close();
  }
});
