const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { migrate } = require('../src/db/migrate');
const { createAuthRepository } = require('../src/modules/auth/auth.repository');
const { createAuthService } = require('../src/modules/auth/auth.service');
const { createAssetsRepository } = require('../src/modules/assets/assets.repository');
const { createEmployeesRepository } = require('../src/modules/employees/employees.repository');
const {
  createAssignmentsRepository
} = require('../src/modules/assignments/assignments.repository');
const { createMovementsRepository } = require('../src/modules/movements/movements.repository');
const { createMovementsService } = require('../src/modules/movements/movements.service');
const { createApprovalsRepository } = require('../src/modules/approvals/approvals.repository');
const { createApprovalsService } = require('../src/modules/approvals/approvals.service');
const { ASSET_STATES } = require('../src/modules/assets/domain/asset-state-machine');

function setup() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  const users = db.prepare(
    "INSERT INTO users(name,email,password_hash,profile_base,must_change_password) VALUES(?,?,?,'ADMIN',0)"
  );
  const adminId = users.run('Admin', 'admin@test.local', 'not-used').lastInsertRowid;
  const requesterId = db
    .prepare(
      "INSERT INTO users(name,email,password_hash,profile_base,must_change_password) VALUES(?,?,?,'TECNICO',0)"
    )
    .run('Técnico', 'tech@test.local', 'not-used').lastInsertRowid;
  const employeeId = db
    .prepare("INSERT INTO employees(name,status) VALUES('Pessoa','ativo')")
    .run().lastInsertRowid;
  const authRepository = createAuthRepository(db);
  const audit = { logUser() {} };
  const auth = createAuthService(authRepository, audit);
  const assets = createAssetsRepository(db);
  const employees = createEmployeesRepository(db);
  const movements = createMovementsService(
    db,
    assets,
    employees,
    createAssignmentsRepository(db),
    createMovementsRepository(db),
    audit,
    auth
  );
  const approvals = createApprovalsService(
    db,
    createApprovalsRepository(db),
    assets,
    employees,
    movements,
    audit,
    auth
  );
  const asset = (status, serial) =>
    db
      .prepare('INSERT INTO assets(equipment_type,serial,status) VALUES(?,?,?)')
      .run('Notebook', serial, status).lastInsertRowid;
  return {
    db,
    approvals,
    movements,
    asset,
    employeeId,
    admin: authRepository.findById(adminId),
    requester: authRepository.findById(requesterId)
  };
}

test('aprova backup, reserva ativo e bloqueia contorno via /move', () => {
  const ctx = setup();
  try {
    const backup = ctx.asset(ASSET_STATES.BACKUP, 'BACKUP-1');
    const request = ctx.approvals.create(
      {
        type: 'USO_EQUIPAMENTO_BACKUP',
        asset_id: backup,
        employee_id: ctx.employeeId,
        justification: 'Substituição temporária'
      },
      ctx.requester
    );
    assert.throws(
      () =>
        ctx.approvals.create(
          {
            type: 'USO_EQUIPAMENTO_BACKUP',
            asset_id: backup,
            employee_id: ctx.employeeId,
            justification: 'Outra solicitação'
          },
          ctx.requester
        ),
      /reservado/
    );
    assert.throws(
      () =>
        ctx.movements.move(
          backup,
          {
            to_status: 'EM_USO',
            employee_id: ctx.employeeId,
            reason: 'Contorno'
          },
          ctx.admin
        ),
      /exige uma solicitação aprovada/
    );
    assert.deepEqual(ctx.approvals.approve(request.id, ctx.admin), {
      ok: true,
      auto_approved: false
    });
    assert.equal(
      ctx.db.prepare('SELECT status FROM assets WHERE id=?').get(backup).status,
      ASSET_STATES.IN_USE
    );
    assert.equal(
      ctx.db
        .prepare(
          "SELECT COUNT(*) count FROM approval_request_events WHERE request_id=? AND event_type='EXECUTADA'"
        )
        .get(request.id).count,
      1
    );
  } finally {
    ctx.db.close();
  }
});

test('rejeição, cancelamento, expiração e mudança concorrente preservam o estado correto', () => {
  const ctx = setup();
  try {
    const rejectedAsset = ctx.asset(ASSET_STATES.BACKUP, 'BACKUP-2');
    const rejected = ctx.approvals.create(
      {
        type: 'USO_EQUIPAMENTO_BACKUP',
        asset_id: rejectedAsset,
        employee_id: ctx.employeeId,
        justification: 'Teste'
      },
      ctx.requester
    );
    assert.throws(
      () => ctx.approvals.reject(rejected.id, 'Sem necessidade', ctx.requester),
      /permissão/
    );
    assert.deepEqual(ctx.approvals.reject(rejected.id, 'Sem necessidade', ctx.admin), { ok: true });
    const cancelAsset = ctx.asset(ASSET_STATES.BACKUP, 'BACKUP-3');
    const cancelled = ctx.approvals.create(
      {
        type: 'USO_EQUIPAMENTO_BACKUP',
        asset_id: cancelAsset,
        employee_id: ctx.employeeId,
        justification: 'Teste'
      },
      ctx.requester
    );
    assert.deepEqual(ctx.approvals.cancel(cancelled.id, ctx.requester), { ok: true });
    const expireAsset = ctx.asset(ASSET_STATES.BACKUP, 'BACKUP-4');
    const expired = ctx.approvals.create(
      {
        type: 'USO_EQUIPAMENTO_BACKUP',
        asset_id: expireAsset,
        employee_id: ctx.employeeId,
        justification: 'Teste'
      },
      ctx.requester
    );
    ctx.db
      .prepare("UPDATE approval_requests SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?")
      .run(expired.id);
    ctx.approvals.list({}, ctx.requester);
    assert.equal(
      ctx.db.prepare('SELECT status FROM approval_requests WHERE id=?').get(expired.id).status,
      'EXPIRADA'
    );
    const changedAsset = ctx.asset(ASSET_STATES.BACKUP, 'BACKUP-5');
    const changed = ctx.approvals.create(
      {
        type: 'USO_EQUIPAMENTO_BACKUP',
        asset_id: changedAsset,
        employee_id: ctx.employeeId,
        justification: 'Teste'
      },
      ctx.requester
    );
    ctx.db.prepare("UPDATE assets SET status='DISPONIVEL' WHERE id=?").run(changedAsset);
    assert.throws(() => ctx.approvals.approve(changed.id, ctx.admin), /mudou desde/);
  } finally {
    ctx.db.close();
  }
});

test('troca é atômica, desativação exige laudo e autoaprovação é auditada', () => {
  const ctx = setup();
  try {
    const oldAsset = ctx.asset(ASSET_STATES.IN_USE, 'OLD-1');
    const newAsset = ctx.asset(ASSET_STATES.BACKUP, 'NEW-1');
    ctx.db
      .prepare('INSERT INTO assignments(asset_id,employee_id) VALUES(?,?)')
      .run(oldAsset, ctx.employeeId);
    const exchange = ctx.approvals.create(
      {
        type: 'TROCA_EQUIPAMENTO',
        old_asset_id: oldAsset,
        new_asset_id: newAsset,
        employee_id: ctx.employeeId,
        justification: 'Defeito no equipamento'
      },
      ctx.requester
    );
    ctx.approvals.approve(exchange.id, ctx.admin);
    assert.equal(
      ctx.db.prepare('SELECT status FROM assets WHERE id=?').get(oldAsset).status,
      ASSET_STATES.UNDER_EVALUATION
    );
    assert.equal(
      ctx.db.prepare('SELECT status FROM assets WHERE id=?').get(newAsset).status,
      ASSET_STATES.IN_USE
    );
    const retired = ctx.asset(ASSET_STATES.AVAILABLE, 'RETIRE-1');
    assert.throws(
      () =>
        ctx.approvals.create(
          { type: 'DESATIVACAO_ATIVO', asset_id: retired, justification: 'Sem reparo' },
          ctx.requester
        ),
      /laudo técnico/
    );
    const own = ctx.approvals.create(
      {
        type: 'DESATIVACAO_ATIVO',
        asset_id: retired,
        justification: 'Sem reparo',
        technical_report: 'Laudo aprovado'
      },
      ctx.admin
    );
    assert.equal(ctx.approvals.approve(own.id, ctx.admin).auto_approved, true);
    assert.equal(
      ctx.db.prepare('SELECT status FROM assets WHERE id=?').get(retired).status,
      ASSET_STATES.DEACTIVATED
    );
  } finally {
    ctx.db.close();
  }
});
