const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const XLSX = require('xlsx');
const { createIntegrationContext, createUser, login } = require('../helpers/integration-context');

const projectDir = path.resolve(__dirname, '..', '..');

function filledWorkbook({ code = 'F001', invalid = false } = {}) {
  const workbook = XLSX.readFile(path.join(projectDir, 'public', 'modelo-importacao-inicial.xlsx'));
  const people = workbook.Sheets.Funcionarios;
  const assets = workbook.Sheets.Ativos;
  for (const [cell, value] of Object.entries({
    A2: code,
    B2: 'Pessoa de teste',
    E2: 'TI',
    J2: 'Ativo'
  })) {
    people[cell] = { t: 's', v: value };
  }
  people['!ref'] = 'A1:L2';
  for (const [cell, value] of Object.entries({
    A2: code,
    B2: 'Notebook',
    F2: `SERIAL-${code}-1`,
    G2: `REF-${code}-1`,
    O2: 'Em uso',
    B3: 'Headset',
    G3: `REF-${code}-2`,
    O3: 'Backup',
    B4: 'Notebook',
    F4: `SERIAL-${code}-3`,
    O4: 'Desativado',
    P4: invalid ? '' : 'Sem reparo',
    Q1: 'LAUDO TÉCNICO',
    Q4: invalid ? '' : 'Placa lógica sem reparo viável.'
  })) {
    assets[cell] = { t: 's', v: value };
  }
  assets['!ref'] = 'A1:Q4';
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function legacyWorkbook() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['NOME SOLICITANTE', 'CIDADE', 'SETOR'],
      ['Pessoa legada', 'São Paulo', 'TI']
    ]),
    'cadastro solicitante e técnicos'
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['FUNCIONARIO', 'SERIAL', 'EQUIPAMENTO', 'HOSTNAME'],
      ['Pessoa legada', 'SERIAL-LEGADO', 'Notebook', 'LEGADO-01']
    ]),
    'controle máquinas_Uso'
  );
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsm' });
}

test('a importacao pela API e atomica para o modelo novo e para a planilha legada', async () => {
  const context = createIntegrationContext();
  try {
    const technician = await createUser(context.db, {
      name: 'Técnico',
      email: 'tecnico@example.test',
      profile: 'TECNICO'
    });
    assert.equal((await login(context.agent, technician.email, technician.password)).status, 200);

    const template = await context.agent.get('/api/templates/initial');
    assert.equal(template.status, 200);
    assert.match(template.headers['content-disposition'], /modelo-importacao-inicial/);

    const imported = await context.agent
      .post('/api/import/excel')
      .attach('file', filledWorkbook(), 'modelo.xlsx');
    assert.equal(imported.status, 200, JSON.stringify(imported.body));
    assert.equal(imported.body.employees, 1);
    assert.equal(imported.body.assets, 3);
    assert.equal(imported.body.skipped, 0);

    const employees = await context.agent.get('/api/employees');
    const assets = await context.agent.get('/api/assets');
    assert.equal(employees.body.total, 1);
    assert.deepEqual(assets.body.items.map((asset) => asset.status).sort(), [
      'BACKUP',
      'DESATIVADO',
      'EM_USO'
    ]);

    const duplicate = await context.agent
      .post('/api/import/excel')
      .attach('file', filledWorkbook(), 'repetido.xlsx');
    assert.equal(duplicate.status, 400);
    const invalid = await context.agent
      .post('/api/import/excel')
      .attach('file', filledWorkbook({ code: 'F002', invalid: true }), 'invalido.xlsx');
    assert.equal(invalid.status, 400);
    assert.match(invalid.body.error.message, /MOTIVO/);
    assert.equal((await context.agent.get('/api/employees')).body.total, 1);

    const legacy = await context.agent
      .post('/api/import/excel')
      .attach('file', legacyWorkbook(), 'legado.xlsm');
    assert.equal(legacy.status, 200, JSON.stringify(legacy.body));
    assert.equal(legacy.body.employees, 1);
    assert.equal(legacy.body.assets, 1);
  } finally {
    context.close();
  }
});
