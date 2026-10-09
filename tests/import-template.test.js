const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const XLSX = require('xlsx');
const argon2 = require('argon2');

const projectDir = path.resolve(__dirname, '..');

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  server.close();
  await once(server, 'close');
  return port;
}

function filledWorkbook({ code = 'F001', invalid = false, hireDate = false } = {}) {
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
  if (hireDate) people.K2 = { t: 'd', v: new Date('2026-10-01T00:00:00Z'), z: 'dd/mm/yyyy' };
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
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Nº CHAMADO', 'SOLICITANTE', 'TIPO DE CHAMADO', 'DESCRIÇÃO', 'STATUS'],
      ['CH-LEGADO', 'Pessoa legada', 'Suporte', 'Teste', 'Fechado']
    ]),
    'registros'
  );
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsm' });
}

test('o modelo importa vínculos e histórico; um erro desfaz toda a planilha', async () => {
  const valid = filledWorkbook();
  const invalid = filledWorkbook({ code: 'F002', invalid: true });
  const testDir = fs.mkdtempSync(path.join(projectDir, '.import-test-'));
  for (const file of [
    'server.js',
    'db.js',
    'config.js',
    'import-template.js',
    'workbook-reader.js'
  ]) {
    fs.copyFileSync(path.join(projectDir, file), path.join(testDir, file));
  }
  fs.cpSync(path.join(projectDir, 'src'), path.join(testDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'public'));
  fs.copyFileSync(
    path.join(projectDir, 'public', 'modelo-importacao-inicial.xlsx'),
    path.join(testDir, 'public', 'modelo-importacao-inicial.xlsx')
  );
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: testDir,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let serverOutput = '';
  child.stdout.on('data', (chunk) => (serverOutput += chunk));
  let serverErrors = '';
  child.stderr.on('data', (chunk) => (serverErrors += chunk));

  let sessionCookie = '';
  async function api(route, method = 'GET', body) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(sessionCookie ? { cookie: sessionCookie } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) sessionCookie = setCookie.split(';')[0];
    return { status: response.status, data: await response.json() };
  }

  async function upload(buffer, filename = 'teste.xlsx') {
    const form = new FormData();
    form.append(
      'file',
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }),
      filename
    );
    const response = await fetch(`http://127.0.0.1:${port}/api/import/excel`, {
      method: 'POST',
      headers: { cookie: sessionCookie },
      body: form
    });
    return { status: response.status, data: await response.json() };
  }

  try {
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      try {
        await api('/api/technicians');
        ready = true;
        break;
      } catch {
        if (child.exitCode !== null) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.ok(
      ready,
      `o servidor de teste deve iniciar (exit=${child.exitCode}): ${serverOutput} ${serverErrors}`
    );
    const control = new (require('better-sqlite3'))(path.join(testDir, 'data', 'inventory.db'));
    try {
      control
        .prepare(
          "INSERT INTO users(name,email,password_hash,profile_base,must_change_password) VALUES(?,?,?,'TECNICO',0)"
        )
        .run('Técnico', 'tecnico@example.test', await argon2.hash('SenhaDeTesteForte1'));
      const userId = control
        .prepare("SELECT id FROM users WHERE email='tecnico@example.test'")
        .get().id;
      const grant = control.prepare(
        "INSERT INTO user_permission_overrides(user_id,permission,effect) VALUES(?,?,'allow')"
      );
      for (const permission of ['employee:create', 'employee:update', 'audit:read']) {
        grant.run(userId, permission);
      }
    } finally {
      control.close();
    }
    const login = await api(
      '/api/auth/login',
      'POST',
      {
        email: 'tecnico@example.test',
        password: 'SenhaDeTesteForte1'
      },
      undefined
    );
    assert.equal(login.status, 200, JSON.stringify(login.data));
    assert.ok(sessionCookie);
    const templateResponse = await fetch(`http://127.0.0.1:${port}/api/templates/initial`, {
      headers: { cookie: sessionCookie }
    });
    assert.equal(templateResponse.status, 200);
    assert.deepEqual(
      Buffer.from(await templateResponse.arrayBuffer()),
      fs.readFileSync(path.join(projectDir, 'public', 'modelo-importacao-inicial.xlsx'))
    );
    const result = await upload(valid);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.employees, 1);
    assert.equal(result.data.assets, 3);
    const importAudit = (await api('/api/admin/audit')).data.find(
      (entry) => entry.action === 'import'
    );
    assert.deepEqual(JSON.parse(importAudit.details).after, {
      employees: 1,
      assets: 3,
      skipped: 0,
      filename: 'teste.xlsx'
    });
    const people = (await api('/api/employees')).data;
    const assets = (await api('/api/assets')).data;
    assert.equal(people.length, 1);
    assert.equal(people[0].hire_date, null);
    assert.equal(people[0].offboarded_at, null);
    const byPatrimony = (await api('/api/assets?q=REF-F001-2')).data;
    assert.equal(byPatrimony.length, 1);
    assert.equal(byPatrimony[0].reference, 'REF-F001-2');
    const changed = await api(
      `/api/employees/${people[0].id}`,
      'PUT',
      {
        hire_date: '2026-10-01',
        cost_center: 'TI-01'
      },
      undefined
    );
    assert.equal(changed.status, 200, JSON.stringify(changed.data));
    const edited = (await api(`/api/employees/${people[0].id}`)).data;
    assert.equal(edited.hire_date, '2026-10-01');
    assert.equal(edited.cost_center, 'TI-01');
    assert.equal(edited.status, 'active');
    assert.equal(
      (await api(`/api/employees/${people[0].id}`, 'PUT', { offboarded_at: '2026-10-02' })).status,
      400
    );
    assert.equal(
      (await api(`/api/employees/${people[0].id}`, 'PUT', { status: 'inactive' })).status,
      400
    );
    assert.equal(
      (await api(`/api/employees/${people[0].id}`, 'PUT', { hire_date: '2026-02-30' })).status,
      400
    );
    assert.deepEqual(assets.map((asset) => asset.status).sort(), [
      'BACKUP',
      'DESATIVADO',
      'EM_USO'
    ]);
    const assigned = assets.find((asset) => asset.status === 'EM_USO');
    assert.equal(assigned.employee_id, people[0].id);
    assert.equal(
      (await api(`/api/assets/${assigned.id}/history`)).data[0].movement_type,
      'IMPORTACAO_INICIAL'
    );

    const assetReport = (await api('/api/dashboard/report?assetStatus=BACKUP')).data;
    assert.equal(assetReport.summary.employeesActive, 1);
    assert.equal(assetReport.summary.assetsManaged, 2);
    assert.equal(assetReport.assets.total, 1);
    assert.deepEqual(assetReport.assets.byStatus, [{ label: 'BACKUP', n: 1 }]);
    assert.equal(assetReport.tickets.total, 0);

    const ticket = await api(
      '/api/tickets',
      'POST',
      {
        employee_id: people[0].id,
        type: 'Suporte',
        description: 'Teste do painel'
      },
      undefined
    );
    assert.equal(ticket.status, 200, JSON.stringify(ticket.data));
    const ticketReport = (await api('/api/dashboard/report?ticketStatus=open&ticketType=Suporte'))
      .data;
    assert.equal(ticketReport.tickets.total, 1);
    assert.equal(ticketReport.tickets.pending, 1);
    assert.equal(ticketReport.tickets.requesters, 1);
    assert.equal(ticketReport.tickets.byType[0].label, 'Suporte');
    assert.equal((await api('/api/dashboard/report?ticketStatus=closed')).data.tickets.total, 0);
    assert.equal(
      (await api('/api/dashboard/report?ticketStatus=closed')).data.summary.ticketsTotal,
      1
    );

    assert.equal((await upload(valid)).status, 400);
    const rejected = await upload(invalid);
    assert.equal(rejected.status, 400);
    assert.match(rejected.data.error, /MOTIVO/);
    assert.equal((await api('/api/employees')).data.length, 1);
    assert.equal((await api('/api/assets')).data.length, 3);

    const dated = await upload(filledWorkbook({ code: 'F003', hireDate: true }));
    assert.equal(dated.status, 200, JSON.stringify(dated.data));
    assert.equal(
      (await api('/api/employees')).data.find((person) => person.code === 'F003').hire_date,
      '2026-10-01'
    );

    const legacy = await upload(legacyWorkbook(), 'legado.xlsm');
    assert.equal(legacy.status, 200, JSON.stringify(legacy.data));
    assert.equal(legacy.data.employees, 1);
    assert.equal(legacy.data.assets, 1);
    assert.equal(legacy.data.tickets, 1);
    assert.equal(
      (await api('/api/tickets')).data.find((item) => item.ticket_number === 'CH-LEGADO').status,
      'closed'
    );
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    assert.equal(path.dirname(path.resolve(testDir)), projectDir);
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});
