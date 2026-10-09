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

test('desligamento valida todos os destinos e grava tudo em uma transação', async () => {
  const testDir = fs.mkdtempSync(path.join(projectDir, '.offboard-test-'));
  fs.copyFileSync(path.join(projectDir, 'server.js'), path.join(testDir, 'server.js'));
  fs.copyFileSync(path.join(projectDir, 'db.js'), path.join(testDir, 'db.js'));
  fs.copyFileSync(path.join(projectDir, 'config.js'), path.join(testDir, 'config.js'));
  fs.copyFileSync(
    path.join(projectDir, 'import-template.js'),
    path.join(testDir, 'import-template.js')
  );
  fs.copyFileSync(
    path.join(projectDir, 'workbook-reader.js'),
    path.join(testDir, 'workbook-reader.js')
  );
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: testDir,
    env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'senha-de-teste' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let serverOutput = '';
  child.stdout.on('data', (chunk) => (serverOutput += chunk));
  let serverErrors = '';
  child.stderr.on('data', (chunk) => (serverErrors += chunk));

  async function request(route, method = 'GET', body) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-technician-id': '1' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  }

  try {
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      try {
        await request('/api/technicians');
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

    const employee = (await request('/api/employees', 'POST', { name: 'Pessoa de teste' })).data.id;
    const first = (
      await request('/api/assets', 'POST', { equipment_type: 'Notebook', serial: 'TESTE-A' })
    ).data.id;
    const second = (
      await request('/api/assets', 'POST', { equipment_type: 'Notebook', serial: 'TESTE-B' })
    ).data.id;
    for (const assetId of [first, second]) {
      assert.equal(
        (
          await request(`/api/assets/${assetId}/move`, 'POST', {
            to_status: 'assigned',
            employee_id: employee,
            reason: 'Entrega de teste'
          })
        ).status,
        200
      );
    }

    const incomplete = await request(`/api/employees/${employee}/offboard`, 'POST', {
      decisions: { [first]: { status: 'backup' } }
    });
    assert.equal(incomplete.status, 400);
    assert.equal((await request(`/api/employees/${employee}/assets`)).data.length, 2);

    const control = new Database(path.join(testDir, 'data', 'inventory.db'));
    try {
      control.exec(`CREATE TRIGGER fail_second_move BEFORE INSERT ON movements
        WHEN NEW.asset_id=${second} AND NEW.to_status='maintenance'
        BEGIN SELECT RAISE(ABORT, 'Falha simulada'); END`);
      const interrupted = await request(`/api/employees/${employee}/offboard`, 'POST', {
        decisions: {
          [first]: { status: 'backup', reason: 'Devolução' },
          [second]: { status: 'maintenance', reason: 'Revisão' }
        }
      });
      assert.equal(interrupted.status, 400);
      assert.equal(
        control.prepare('SELECT status FROM employees WHERE id=?').get(employee).status,
        'active'
      );
      assert.equal(
        control.prepare('SELECT COUNT(*) n FROM assignments WHERE returned_at IS NULL').get().n,
        2
      );
      assert.equal(
        control
          .prepare("SELECT COUNT(*) n FROM movements WHERE to_status IN ('backup','maintenance')")
          .get().n,
        0
      );
      control.exec('DROP TRIGGER fail_second_move');
    } finally {
      control.close();
    }

    const completed = await request(`/api/employees/${employee}/offboard`, 'POST', {
      decisions: {
        [first]: { status: 'backup', reason: 'Devolução' },
        [second]: { status: 'maintenance', reason: 'Revisão' }
      }
    });
    assert.equal(completed.status, 200);
    assert.equal(completed.data.moved, 2);
    assert.equal((await request(`/api/employees/${employee}/assets`)).data.length, 0);

    const token = (await request('/api/admin/login', 'POST', { password: 'senha-de-teste' })).data
      .token;
    const updatedDate = await fetch(`http://127.0.0.1:${port}/api/employees/${employee}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ offboarded_at: '2026-09-30' })
    });
    assert.equal(updatedDate.status, 200);

    const db = new Database(path.join(testDir, 'data', 'inventory.db'), { readonly: true });
    try {
      const person = db
        .prepare('SELECT status,offboarded_at FROM employees WHERE id=?')
        .get(employee);
      assert.equal(person.status, 'inactive');
      assert.equal(person.offboarded_at, '2026-09-30');
      assert.equal(
        db.prepare('SELECT COUNT(*) n FROM assignments WHERE returned_at IS NULL').get().n,
        0
      );
      assert.equal(
        db
          .prepare("SELECT COUNT(*) n FROM movements WHERE to_status IN ('backup','maintenance')")
          .get().n,
        2
      );
      assert.equal(db.prepare('SELECT status FROM assets WHERE id=?').get(first).status, 'backup');
      assert.equal(
        db.prepare('SELECT status FROM assets WHERE id=?').get(second).status,
        'maintenance'
      );
    } finally {
      db.close();
    }
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    // O alvo foi criado pelo teste diretamente dentro do projeto.
    assert.equal(path.dirname(path.resolve(testDir)), projectDir);
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});
