const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const Database = require('better-sqlite3');

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

test('contrato HTTP mantém rotas e oculta falhas internas', async () => {
  const testDir = fs.mkdtempSync(path.join(projectDir, '.contract-test-'));
  fs.copyFileSync(path.join(projectDir, 'server.js'), path.join(testDir, 'server.js'));
  fs.cpSync(path.join(projectDir, 'src'), path.join(testDir, 'src'), { recursive: true });
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: testDir,
    env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'senha-de-teste' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));

  async function api(route, method = 'GET', body, token, technicianId) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(technicianId ? { 'x-technician-id': String(technicianId) } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
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
    assert.ok(ready, `servidor não iniciou (exit=${child.exitCode}): ${output}`);

    assert.equal((await api('/api/admin/login', 'POST', { password: 'errada' })).status, 401);
    assert.equal((await api('/api/admin/audit')).status, 401);
    assert.equal((await api('/api/employees', 'POST', { name: 'Pessoa' })).status, 400);
    assert.equal((await api('/api/employees', 'POST', [])).status, 400);
    const malformed = await fetch(`http://127.0.0.1:${port}/api/employees`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-technician-id': '1' },
      body: '{'
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: 'JSON inválido.' });

    const employee = await api(
      '/api/employees',
      'POST',
      { code: 'E1', name: 'Pessoa de contrato', email: 'pessoa@example.test' },
      undefined,
      1
    );
    assert.equal(employee.status, 200);
    const employeeId = employee.data.id;
    assert.equal((await api(`/api/employees/${employeeId}`)).data.name, 'Pessoa de contrato');
    assert.equal((await api('/api/employees/999999')).status, 404);

    const asset = await api(
      '/api/assets',
      'POST',
      { equipment_type: 'Notebook', serial: 'CONTRATO-1' },
      undefined,
      1
    );
    assert.equal(asset.status, 200);
    const assetId = asset.data.id;
    const duplicate = await api(
      '/api/assets',
      'POST',
      { equipment_type: 'Notebook', serial: 'CONTRATO-1' },
      undefined,
      1
    );
    assert.equal(duplicate.status, 400);
    assert.equal(duplicate.data.error, 'Já existe um equipamento com esse serial.');
    assert.equal(
      (
        await api(
          `/api/assets/${assetId}/move`,
          'POST',
          { to_status: 'assigned', employee_id: employeeId },
          undefined,
          1
        )
      ).status,
      200
    );
    assert.equal((await api(`/api/employees/${employeeId}/assets`)).data.length, 1);
    assert.equal((await api(`/api/assets/${assetId}/history`)).data[0].movement_type, 'assign');

    const ticket = await api(
      '/api/tickets',
      'POST',
      { employee_id: employeeId, asset_id: assetId, description: 'Suporte' },
      undefined,
      1
    );
    assert.equal(ticket.status, 200);
    assert.equal((await api('/api/dashboard')).data.counts.openTickets, 1);
    assert.equal((await api('/api/dashboard/report?ticketStatus=open')).data.tickets.total, 1);

    const token = (await api('/api/admin/login', 'POST', { password: 'senha-de-teste' })).data
      .token;
    assert.ok(token);
    assert.ok((await api('/api/admin/audit', 'GET', undefined, token)).data.length >= 3);
    assert.equal(
      (await api(`/api/employees/${employeeId}`, 'PUT', { department: 'TI' }, token)).status,
      200
    );
    assert.equal(
      (await api(`/api/assets/${assetId}`, 'PUT', { equipment_type: 'Notebook' }, token)).status,
      200
    );
    assert.equal(
      (await api('/api/admin/technicians', 'POST', { name: 'Técnico 2' }, token)).status,
      200
    );
    assert.equal(
      (await api('/api/import/excel', 'POST', undefined, token)).data.error,
      'Selecione uma planilha Excel.'
    );

    const control = new Database(path.join(testDir, 'data', 'inventory.db'));
    try {
      control.exec(`CREATE TRIGGER fail_ticket BEFORE INSERT ON tickets
        BEGIN SELECT RAISE(ABORT, 'INTERNAL-SECRET'); END`);
      const failure = await api(
        '/api/tickets',
        'POST',
        { employee_id: employeeId, description: 'Falha simulada' },
        undefined,
        1
      );
      assert.equal(failure.status, 400);
      assert.ok(!JSON.stringify(failure.data).includes('INTERNAL-SECRET'));
      assert.ok(!JSON.stringify(failure.data).includes('stack'));
      control.exec('DROP TRIGGER fail_ticket');
    } finally {
      control.close();
    }
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    assert.equal(path.dirname(path.resolve(testDir)), projectDir);
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});
