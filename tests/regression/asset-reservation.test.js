// Rodada 2, item 1: ativo com solicitação PENDENTE só é movido pela própria solicitação.
const test = require('node:test');
const assert = require('node:assert/strict');
const { apiScenario } = require('../helpers/regression-scenario');

const RESERVED = (id) => new RegExp(`ativo reservado pela solicitação #${id}`, 'i');

function assertReserved(response, requestId) {
  assert.equal(response.status, 409, JSON.stringify(response.body));
  assert.match(response.body.error.message, RESERVED(requestId));
}

test('/move recusa com 409 qualquer mudança de estado de ativo reservado, para todos os perfis', async (t) => {
  const s = await apiScenario(t);
  const person = s.employee('Pessoa');
  const backup = s.asset('BACKUP', 'RESERVA-1');
  const created = await s.technicianSession.post('/api/approval-requests').send({
    type: 'USO_EQUIPAMENTO_BACKUP',
    asset_id: backup,
    employee_id: person,
    justification: 'Notebook quebrou'
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  for (const session of [s.technicianSession, s.adminSession]) {
    for (const body of [
      { to_status: 'EM_MANUTENCAO', reason: 'Tela' },
      { to_status: 'EM_AVALIACAO', reason: 'Checar' }
    ]) {
      assertReserved(await session.post(`/api/assets/${backup}/move`).send(body), created.body.id);
    }
  }
  assert.equal(s.status(backup), 'BACKUP');

  const approved = await s.adminSession
    .post(`/api/approval-requests/${created.body.id}/approve`)
    .send({});
  assert.equal(approved.status, 200, 'a execução da própria solicitação move o ativo');
  assert.equal(s.status(backup), 'EM_USO');
  const free = await s.technicianSession
    .post(`/api/assets/${backup}/move`)
    .send({ to_status: 'BACKUP' });
  assert.equal(free.status, 200, 'depois da execução a reserva é liberada');
});

test('desligamento não move ativo reservado por troca pendente', async (t) => {
  const s = await apiScenario(t);
  const leaving = s.employee('Saindo');
  const old = s.asset('EM_USO', 'TROCA-ANTIGO');
  s.assign(old, leaving);
  const replacement = s.asset('BACKUP', 'TROCA-NOVO');
  const exchange = await s.technicianSession.post('/api/approval-requests').send({
    type: 'TROCA_EQUIPAMENTO',
    employee_id: leaving,
    old_asset_id: old,
    new_asset_id: replacement,
    justification: 'Defeito'
  });
  assert.equal(exchange.status, 201, JSON.stringify(exchange.body));

  const started = await s.hrSession
    .post(`/api/employees/${leaving}/offboarding/start`)
    .send({ offboarding_date: '2026-10-31', reason: 'Pedido de demissão' });
  assertReserved(started, exchange.body.id);
  assert.equal(s.status(old), 'EM_USO');
  assert.equal(
    s.db.prepare('SELECT status FROM employees WHERE id=?').get(leaving).status,
    'ativo',
    'a transação do desligamento é desfeita'
  );
});

test('destino do desligamento não move ativo com desativação pendente', async (t) => {
  const s = await apiScenario(t);
  const leaving = s.employee('Saindo');
  const laptop = s.asset('EM_USO', 'DESLIG-RES');
  s.assign(laptop, leaving);
  await s.hrSession
    .post(`/api/employees/${leaving}/offboarding/start`)
    .send({ offboarding_date: '2026-10-31', reason: 'Fim de contrato' });
  await s.technicianSession
    .post(`/api/offboarding/assets/${laptop}/receive`)
    .send({ physical_condition: 'Tela quebrada', accessories: 'Carregador' });
  const proposal = await s.technicianSession
    .post(`/api/offboarding/assets/${laptop}/destination`)
    .send({
      destination: 'DESATIVADO',
      justification: 'Sem reparo',
      technical_report: 'Placa comprometida'
    });
  assert.equal(proposal.status, 200, JSON.stringify(proposal.body));
  const requestId = proposal.body.approval_request_id;

  assertReserved(
    await s.technicianSession
      .post(`/api/offboarding/assets/${laptop}/destination`)
      .send({ destination: 'BACKUP', justification: 'Mudei de ideia' }),
    requestId
  );
  assertReserved(
    await s.adminSession.post(`/api/assets/${laptop}/move`).send({ to_status: 'BACKUP' }),
    requestId
  );
  assert.equal(s.status(laptop), 'EM_AVALIACAO');
});

test('rejeição, cancelamento e expiração liberam a reserva', async (t) => {
  const s = await apiScenario(t);
  const person = s.employee('Pessoa');
  const open = (serial) =>
    s.technicianSession.post('/api/approval-requests').send({
      type: 'USO_EQUIPAMENTO_BACKUP',
      asset_id: s.asset('BACKUP', serial),
      employee_id: person,
      justification: 'Precisa'
    });
  const assetOf = (id) =>
    s.db.prepare('SELECT asset_id FROM approval_request_assets WHERE request_id=?').get(id)
      .asset_id;

  const rejected = (await open('LIB-1')).body.id;
  await s.adminSession.post(`/api/approval-requests/${rejected}/reject`).send({ reason: 'Não' });
  const cancelled = (await open('LIB-2')).body.id;
  await s.technicianSession.post(`/api/approval-requests/${cancelled}/cancel`).send({});
  const expired = (await open('LIB-3')).body.id;
  s.db
    .prepare('UPDATE approval_requests SET expires_at=? WHERE id=?')
    .run('2000-01-01T00:00:00.000Z', expired);

  for (const id of [rejected, cancelled, expired]) {
    const moved = await s.technicianSession
      .post(`/api/assets/${assetOf(id)}/move`)
      .send({ to_status: 'EM_MANUTENCAO', reason: 'Revisão' });
    assert.equal(moved.status, 200, `solicitação #${id}: ${JSON.stringify(moved.body)}`);
  }
});
