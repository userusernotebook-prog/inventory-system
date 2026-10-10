// Rodada 2, item 3: devolução do desligamento só avança pelo recebimento registrado.
const test = require('node:test');
const assert = require('node:assert/strict');
const { apiScenario } = require('../helpers/regression-scenario');

async function offboardingWithAsset(s, name = 'Saindo') {
  const person = s.employee(name);
  const laptop = s.asset('EM_USO', `DESLIG-${name}`);
  s.assign(laptop, person);
  const started = await s.hrSession
    .post(`/api/employees/${person}/offboarding/start`)
    .send({ offboarding_date: '2026-10-31', reason: 'Fim de contrato' });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  assert.equal(s.status(laptop), 'PENDENTE_DEVOLUCAO');
  return { person, laptop };
}

test('/move não tira o ativo de PENDENTE_DEVOLUCAO, nem para avaliação, backup ou manutenção', async (t) => {
  const s = await apiScenario(t);
  const { laptop } = await offboardingWithAsset(s);
  for (const body of [
    { to_status: 'EM_AVALIACAO', reason: 'Pular recibo' },
    { to_status: 'BACKUP' },
    { to_status: 'EM_MANUTENCAO', reason: 'Pular recibo' }
  ]) {
    const response = await s.adminSession.post(`/api/assets/${laptop}/move`).send(body);
    assert.equal(response.status, 400, `${body.to_status}: ${JSON.stringify(response.body)}`);
  }
  const deactivation = await s.technicianSession.post('/api/approval-requests').send({
    type: 'DESATIVACAO_ATIVO',
    asset_id: laptop,
    justification: 'Pular avaliação',
    technical_report: 'Laudo'
  });
  assert.equal(deactivation.status, 400, JSON.stringify(deactivation.body));
  assert.equal(s.status(laptop), 'PENDENTE_DEVOLUCAO');
});

test('/move não marca devolução pendente fora do início do desligamento', async (t) => {
  const s = await apiScenario(t);
  const person = s.employee('Ativa');
  const laptop = s.asset('EM_USO', 'FORA-DESLIG');
  s.assign(laptop, person);
  const response = await s.adminSession
    .post(`/api/assets/${laptop}/move`)
    .send({ to_status: 'PENDENTE_DEVOLUCAO' });
  assert.equal(response.status, 400, JSON.stringify(response.body));
  assert.equal(s.status(laptop), 'EM_USO');
});

test('recebimento exige estado físico e acessórios', async (t) => {
  const s = await apiScenario(t);
  const { laptop } = await offboardingWithAsset(s);
  for (const body of [{ accessories: 'Carregador' }, { physical_condition: 'Bom estado' }]) {
    const response = await s.technicianSession
      .post(`/api/offboarding/assets/${laptop}/receive`)
      .send(body);
    assert.equal(response.status, 400, `${JSON.stringify(body)}: ${JSON.stringify(response.body)}`);
  }
  const received = await s.technicianSession
    .post(`/api/offboarding/assets/${laptop}/receive`)
    .send({ physical_condition: 'Bom estado', accessories: 'Nenhum' });
  assert.equal(received.status, 200, JSON.stringify(received.body));
  assert.equal(s.status(laptop), 'EM_AVALIACAO');
  const receipt = s.db.prepare('SELECT * FROM asset_receipts WHERE asset_id=?').get(laptop);
  assert.equal(receipt.physical_condition, 'Bom estado');
  assert.equal(receipt.accessories, 'Nenhum');
});

test('depois do recebimento: BACKUP ou manutenção direto, desativação só por aprovação', async (t) => {
  const s = await apiScenario(t);
  const destinations = [
    ['BACKUP', { destination: 'BACKUP', justification: 'Bom estado' }],
    ['EM_MANUTENCAO', { destination: 'EM_MANUTENCAO', justification: 'Trocar bateria' }]
  ];
  for (const [expected, body] of destinations) {
    const { laptop } = await offboardingWithAsset(s, `Pessoa ${expected}`);
    await s.technicianSession
      .post(`/api/offboarding/assets/${laptop}/receive`)
      .send({ physical_condition: 'Usado', accessories: 'Carregador' });
    const response = await s.technicianSession
      .post(`/api/offboarding/assets/${laptop}/destination`)
      .send(body);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(s.status(laptop), expected);
  }
  const { laptop } = await offboardingWithAsset(s, 'Pessoa Desativar');
  await s.technicianSession
    .post(`/api/offboarding/assets/${laptop}/receive`)
    .send({ physical_condition: 'Quebrado', accessories: 'Nenhum' });
  const direct = await s.adminSession
    .post(`/api/assets/${laptop}/move`)
    .send({ to_status: 'DESATIVADO', reason: 'Sem reparo', technical_report: 'Laudo' });
  assert.equal(direct.status, 400, 'desativação direta exige aprovação');
  const proposal = await s.technicianSession
    .post(`/api/offboarding/assets/${laptop}/destination`)
    .send({ destination: 'DESATIVADO', justification: 'Sem reparo', technical_report: 'Laudo' });
  assert.equal(proposal.status, 200, JSON.stringify(proposal.body));
  assert.ok(proposal.body.approval_request_id);
  assert.equal(s.status(laptop), 'EM_AVALIACAO');
});

test('RH não conclui o desligamento com ativo sem registro de recebimento', async (t) => {
  const s = await apiScenario(t);
  const { person, laptop } = await offboardingWithAsset(s);
  // Situação herdada da regra antiga: o ativo saiu da devolução sem recibo.
  s.db.prepare("UPDATE assets SET status='BACKUP' WHERE id=?").run(laptop);
  s.db
    .prepare('UPDATE assignments SET returned_at=? WHERE asset_id=? AND returned_at IS NULL')
    .run(new Date().toISOString(), laptop);
  const blocked = await s.hrSession.post(`/api/employees/${person}/offboarding/conclude`).send({});
  assert.equal(blocked.status, 400, JSON.stringify(blocked.body));
  assert.match(blocked.body.error.message, new RegExp(`#${laptop}`));
  assert.equal(
    s.db.prepare('SELECT status FROM employees WHERE id=?').get(person).status,
    'em_desligamento'
  );

  const other = await offboardingWithAsset(s, 'Com recibo');
  await s.technicianSession
    .post(`/api/offboarding/assets/${other.laptop}/receive`)
    .send({ physical_condition: 'Bom', accessories: 'Carregador' });
  await s.technicianSession
    .post(`/api/offboarding/assets/${other.laptop}/destination`)
    .send({ destination: 'BACKUP', justification: 'Em bom estado' });
  const concluded = await s.hrSession
    .post(`/api/employees/${other.person}/offboarding/conclude`)
    .send({});
  assert.equal(concluded.status, 200, JSON.stringify(concluded.body));
});
