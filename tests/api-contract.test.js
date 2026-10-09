const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const Database = require('better-sqlite3');
const argon2 = require('argon2');

const projectDir = path.resolve(__dirname, '..');

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}

test('a API só libera rotas privadas após sessão autenticada', async () => {
  const testDir = fs.mkdtempSync(path.join(projectDir, '.contract-test-'));
  fs.copyFileSync(path.join(projectDir, 'server.js'), path.join(testDir, 'server.js'));
  fs.cpSync(path.join(projectDir, 'src'), path.join(testDir, 'src'), { recursive: true });
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: testDir,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  async function request(route, options = {}) {
    return fetch(`http://127.0.0.1:${port}${route}`, options);
  }

  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        if ((await request('/api/assets')).status === 401) break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    assert.equal((await request('/api/assets')).status, 401);
    assert.equal((await request('/api/auth/login', { method: 'POST' })).status, 400);

    const db = new Database(path.join(testDir, 'data', 'inventory.db'));
    try {
      db.prepare(
        "INSERT INTO users(name,email,password_hash,profile_base,must_change_password) VALUES(?,?,?,'CONSULTA',0)"
      ).run('Consulta', 'consulta@example.test', await argon2.hash('SenhaDeTesteForte1'));
    } finally {
      db.close();
    }
    const login = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'consulta@example.test', password: 'SenhaDeTesteForte1' })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await request('/api/assets', { headers: { cookie } })).status, 200);
    assert.equal(
      (await request('/api/assets', { method: 'POST', headers: { cookie } })).status,
      403
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
