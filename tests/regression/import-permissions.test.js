// Rodada 2, item 6: importação respeita import:initial_load, permissões e alcance.
const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { apiScenario } = require('../helpers/regression-scenario');

const EMPLOYEE_HEADERS = ['CÓDIGO', 'NOME', 'STATUS', 'CIDADE', 'DEPARTAMENTO'];
const ASSET_HEADERS = [
  'CÓDIGO FUNCIONÁRIO',
  'EQUIPAMENTO',
  'SERIAL',
  'REFERÊNCIA',
  'STATUS',
  'CIDADE',
  'MOTIVO / OBSERVAÇÃO',
  'LAUDO TÉCNICO'
];

function template({ employees = [], assets = [] }) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([EMPLOYEE_HEADERS, ...employees]),
    'Funcionarios'
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([ASSET_HEADERS, ...assets]),
    'Ativos'
  );
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function legacy(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['FUNCIONARIO', 'EQUIPAMENTO', 'SERIAL', 'CIDADE'], ...rows]),
    'controle máquinas_Uso'
  );
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

const importFile = (session, buffer) =>
  session.post('/api/import/excel').attach('file', buffer, 'carga.xlsx');
const movementsOf = (s, serial) =>
  s.db
    .prepare(
      `SELECT m.movement_type,m.from_status,m.to_status,m.responsible_user_id FROM movements m
      JOIN assets a ON a.id=m.asset_id WHERE a.serial=?`
    )
    .all(serial);
const assetBySerial = (s, serial) =>
  s.db.prepare('SELECT * FROM assets WHERE serial=?').get(serial);

test('sem import:initial_load só entram ativos DISPONIVEL ou BACKUP, sem atribuição', async (t) => {
  const s = await apiScenario(t);
  s.employee('Pessoa', { code: 'F1' });
  for (const [status, employeeCode] of [
    ['Em uso', 'F1'],
    ['Desativado', ''],
    ['Manutenção', ''],
    ['Backup', 'F1']
  ]) {
    const response = await importFile(
      s.technicianSession,
      template({
        assets: [[employeeCode, 'Notebook', `IMP-${status}`, '', status, '', 'Motivo', 'Laudo']]
      })
    );
    assert.equal(response.status, 400, `${status}: ${JSON.stringify(response.body)}`);
    assert.equal(assetBySerial(s, `IMP-${status}`), undefined);
  }

  const allowed = await importFile(
    s.technicianSession,
    template({
      assets: [
        ['', 'Notebook', 'IMP-NOVO', '', 'Disponível', '', '', ''],
        ['', 'Notebook', 'IMP-BACKUP', '', 'Backup', '', '', '']
      ]
    })
  );
  assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
  for (const serial of ['IMP-NOVO', 'IMP-BACKUP']) {
    assert.deepEqual(
      movementsOf(s, serial).map((m) => [m.movement_type, m.responsible_user_id]),
      [['CARGA_INICIAL', s.technician.id]]
    );
    assert.equal(s.holder(assetBySerial(s, serial).id), null);
  }
});

test('com import:initial_load a carga cria EM_USO e DESATIVADO com movimentação CARGA_INICIAL e autor', async (t) => {
  const s = await apiScenario(t);
  s.db
    .prepare(
      "INSERT INTO user_permission_overrides(user_id,permission,effect) VALUES(?,'import:initial_load','allow')"
    )
    .run(s.technician.id);
  const technician = await s.sessionFor(s.technician);
  const person = s.employee('Pessoa', { code: 'F1' });
  const response = await importFile(
    technician,
    template({
      assets: [
        ['F1', 'Notebook', 'CARGA-USO', '', 'Em uso', '', '', ''],
        ['', 'Notebook', 'CARGA-DESAT', '', 'Desativado', '', 'Sem reparo', 'Laudo da carga']
      ]
    })
  );
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(assetBySerial(s, 'CARGA-USO').status, 'EM_USO');
  assert.equal(s.holder(assetBySerial(s, 'CARGA-USO').id), person);
  assert.equal(assetBySerial(s, 'CARGA-DESAT').status, 'DESATIVADO');
  for (const [serial, status] of [
    ['CARGA-USO', 'EM_USO'],
    ['CARGA-DESAT', 'DESATIVADO']
  ]) {
    assert.deepEqual(movementsOf(s, serial), [
      {
        movement_type: 'CARGA_INICIAL',
        from_status: null,
        to_status: status,
        responsible_user_id: s.technician.id
      }
    ]);
  }
  const pending = await importFile(
    technician,
    template({ assets: [['', 'Notebook', 'CARGA-PEND', '', 'Pendente devolução', '', '', '']] })
  );
  assert.equal(pending.status, 400, 'devolução pendente só existe no desligamento');
});

test('importação não cria funcionários sem employee:create', async (t) => {
  const s = await apiScenario(t);
  const response = await importFile(
    s.technicianSession,
    template({ employees: [['F9', 'Pessoa Nova', 'Ativo', '', '']] })
  );
  assert.equal(response.status, 400, JSON.stringify(response.body));
  assert.match(response.body.error.message, /employee:create/);
  assert.equal(s.db.prepare("SELECT COUNT(*) n FROM employees WHERE code='F9'").get().n, 0);
});

test('importação respeita o alcance de quem importa', async (t) => {
  const s = await apiScenario(t);
  for (const permission of ['import:initial_load', 'employee:create']) {
    s.db
      .prepare('INSERT INTO user_permission_overrides(user_id,permission,effect) VALUES(?,?,?)')
      .run(s.technician.id, permission, 'allow');
  }
  s.db
    .prepare("INSERT INTO user_scopes(user_id,scope_type,scope_value) VALUES(?,'city','Recife')")
    .run(s.technician.id);
  const technician = await s.sessionFor(s.technician);
  const outsideAsset = await importFile(
    technician,
    template({ assets: [['', 'Notebook', 'FORA-1', '', 'Backup', 'Manaus', '', '']] })
  );
  assert.equal(outsideAsset.status, 400, JSON.stringify(outsideAsset.body));
  assert.match(outsideAsset.body.error.message, /alcance/);
  const outsideEmployee = await importFile(
    technician,
    template({ employees: [['F8', 'Pessoa Manaus', 'Ativo', 'Manaus', '']] })
  );
  assert.equal(outsideEmployee.status, 400, JSON.stringify(outsideEmployee.body));
  const inside = await importFile(
    technician,
    template({ assets: [['', 'Notebook', 'DENTRO-1', '', 'Backup', 'Recife', '', '']] })
  );
  assert.equal(inside.status, 200, JSON.stringify(inside.body));
});

test('planilha legada: só com import:initial_load e com movimentação ao atribuir', async (t) => {
  const s = await apiScenario(t);
  const file = legacy([
    ['Pessoa Legada', 'Notebook', 'LEG-USO', ''],
    ['', 'Notebook', 'LEG-SOLTO', '']
  ]);
  const denied = await importFile(s.technicianSession, file);
  assert.equal(denied.status, 400, JSON.stringify(denied.body));
  assert.match(denied.body.error.message, /import:initial_load/);

  const loaded = await importFile(s.adminSession, file);
  assert.equal(loaded.status, 200, JSON.stringify(loaded.body));
  const inUse = assetBySerial(s, 'LEG-USO');
  assert.equal(inUse.status, 'EM_USO');
  assert.ok(s.holder(inUse.id));
  assert.deepEqual(movementsOf(s, 'LEG-USO'), [
    {
      movement_type: 'CARGA_INICIAL',
      from_status: null,
      to_status: 'EM_USO',
      responsible_user_id: s.admin.id
    }
  ]);
  // Equipamento legado sem dono é usado: entra em BACKUP, nunca em DISPONIVEL (R1).
  assert.equal(assetBySerial(s, 'LEG-SOLTO').status, 'BACKUP');
  assert.equal(movementsOf(s, 'LEG-SOLTO')[0].movement_type, 'CARGA_INICIAL');
});
