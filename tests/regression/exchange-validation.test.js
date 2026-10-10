// Rodada 2, item 2: a troca só usa o ativo do próprio funcionário, na criação e na aprovação.
const test = require('node:test');
const assert = require('node:assert/strict');
const { apiScenario } = require('../helpers/regression-scenario');

function exchange(s, body) {
  return s.technicianSession.post('/api/approval-requests').send({
    type: 'TROCA_EQUIPAMENTO',
    justification: 'Equipamento com defeito',
    ...body
  });
}

test('criação recusa ativo antigo que não está em uso pelo funcionário da solicitação', async (t) => {
  const s = await apiScenario(t);
  const a = s.employee('Pessoa A');
  const b = s.employee('Pessoa B');
  const ofB = s.asset('EM_USO', 'DE-B');
  s.assign(ofB, b);
  const unassigned = s.asset('EM_USO', 'SEM-DONO');
  const notInUse = s.asset('BACKUP', 'NAO-EM-USO');
  const replacement = s.asset('BACKUP', 'NOVO');

  for (const old of [ofB, unassigned, notInUse]) {
    const response = await exchange(s, {
      employee_id: a,
      old_asset_id: old,
      new_asset_id: replacement
    });
    assert.equal(response.status, 400, `ativo antigo #${old}: ${JSON.stringify(response.body)}`);
  }
  assert.equal(s.holder(ofB), b);
  assert.equal(s.status(replacement), 'BACKUP');
});

test('aprovação revalida que o ativo antigo continua com o funcionário', async (t) => {
  const s = await apiScenario(t);
  const a = s.employee('Pessoa A');
  const b = s.employee('Pessoa B');
  const old = s.asset('EM_USO', 'ANTIGO');
  s.assign(old, a);
  const replacement = s.asset('BACKUP', 'NOVO');
  const created = await exchange(s, {
    employee_id: a,
    old_asset_id: old,
    new_asset_id: replacement
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  // Simula vínculo alterado fora da API (dados legados ou correção manual).
  s.db
    .prepare('UPDATE assignments SET employee_id=? WHERE asset_id=? AND returned_at IS NULL')
    .run(b, old);
  const approved = await s.adminSession
    .post(`/api/approval-requests/${created.body.id}/approve`)
    .send({});
  assert.equal(approved.status, 409, JSON.stringify(approved.body));
  assert.equal(s.status(old), 'EM_USO');
  assert.equal(s.holder(old), b);
  assert.equal(s.status(replacement), 'BACKUP');
  assert.equal(
    s.db.prepare('SELECT status FROM approval_requests WHERE id=?').get(created.body.id).status,
    'PENDENTE'
  );
});

test('ativo novo pode ser estoque novo (DISPONIVEL) ou BACKUP, e só muda com a aprovação', async (t) => {
  const s = await apiScenario(t);
  const person = s.employee('Pessoa');
  for (const newStatus of ['DISPONIVEL', 'BACKUP']) {
    const old = s.asset('EM_USO', `ANTIGO-${newStatus}`);
    s.assign(old, person);
    const replacement = s.asset(newStatus, `NOVO-${newStatus}`);
    const created = await exchange(s, {
      employee_id: person,
      old_asset_id: old,
      new_asset_id: replacement
    });
    assert.equal(created.status, 201, `${newStatus}: ${JSON.stringify(created.body)}`);
    assert.equal(s.status(replacement), newStatus, 'a troca pendente não atribui o novo ativo');
    const approved = await s.adminSession
      .post(`/api/approval-requests/${created.body.id}/approve`)
      .send({});
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(s.status(replacement), 'EM_USO');
    assert.equal(s.holder(replacement), person);
    assert.equal(s.status(old), 'EM_AVALIACAO');
    assert.equal(s.holder(old), null);
  }
});

test('ativo novo já em uso por outra pessoa é recusado', async (t) => {
  const s = await apiScenario(t);
  const a = s.employee('Pessoa A');
  const b = s.employee('Pessoa B');
  const old = s.asset('EM_USO', 'ANTIGO');
  s.assign(old, a);
  const ofB = s.asset('EM_USO', 'DE-B');
  s.assign(ofB, b);
  const response = await exchange(s, { employee_id: a, old_asset_id: old, new_asset_id: ofB });
  assert.equal(response.status, 400, JSON.stringify(response.body));
});
