const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const projectDir = path.resolve(__dirname, '..', '..');

// Variáveis que o sistema lê. Os processos filhos começam sem elas para que o
// ambiente de quem roda os testes não interfira no cenário reproduzido.
const MANAGED_VARIABLES = [
  'PORT',
  'NODE_ENV',
  'APP_ORIGIN',
  'TOTP_ENCRYPTION_KEY',
  'TOTP_ENCRYPTION_KEY_FILE',
  'EMPLOYEE_ANONYMIZATION_DAYS',
  'DATABASE_PATH',
  'BACKUP_DIR',
  'BACKUP_EXTERNAL_DIR',
  'BACKUP_RETENTION_DAYS',
  'BACKUP_INTERVAL_SECONDS',
  'BACKUP_MONITOR_URL',
  'AGE_RECIPIENT',
  'AGE_IDENTITY_FILE',
  'ADMIN_NAME',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'ADMIN_PASSWORD_FILE'
];

// Copia o necessário para executar o sistema fora do repositório, sem .env,
// como acontece na imagem Docker. As dependências vêm do projeto via NODE_PATH.
function copyProject() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-regression-'));
  for (const entry of ['src', 'scripts']) {
    fs.cpSync(path.join(projectDir, entry), path.join(directory, entry), { recursive: true });
  }
  for (const file of ['server.js', 'package.json', '.env.example']) {
    fs.copyFileSync(path.join(projectDir, file), path.join(directory, file));
  }
  return directory;
}

// No Windows o SQLite pode demorar alguns milissegundos para liberar o arquivo.
function removeDirectory(directory) {
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

function childEnvironment(overrides = {}) {
  const environment = { ...process.env };
  for (const name of MANAGED_VARIABLES) delete environment[name];
  return {
    ...environment,
    NODE_PATH: path.join(projectDir, 'node_modules'),
    ...overrides
  };
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function runNode(cwd, args, environment) {
  return spawnSync(process.execPath, args, { cwd, env: environment, encoding: 'utf8' });
}

function npmCli() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(
      path.dirname(process.execPath),
      '..',
      'lib',
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js'
    )
  ].filter(Boolean);
  const found = candidates.find(
    (candidate) => /npm-cli\.js$/.test(candidate) && fs.existsSync(candidate)
  );
  if (!found) throw new Error('npm-cli.js não encontrado para executar npm run.');
  return found;
}

// Executa um script do package.json pelo npm, como o README orienta.
function runNpmScript(cwd, script, args, environment) {
  const npm = npmCli();
  const extra = args.length ? ['--', ...args] : [];
  return spawnSync(process.execPath, [npm, 'run', '--silent', script, ...extra], {
    cwd,
    env: environment,
    encoding: 'utf8'
  });
}

// Encerra o processo e seus filhos: `npm start` roda o servidor em um subprocesso.
function killTree(child) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    process.kill(-child.pid, 'SIGTERM');
  }
}

async function startServer(
  cwd,
  environment,
  { port = Number(environment.PORT), npmStart = false } = {}
) {
  const command = npmStart ? [npmCli(), 'start'] : ['server.js'];
  const child = spawn(process.execPath, command, {
    cwd,
    env: environment,
    detached: process.platform !== 'win32'
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`O servidor encerrou com código ${child.exitCode}:\n${output}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) break;
    } catch {
      // Ainda iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    output: () => output,
    async stop() {
      if (child.exitCode === null) killTree(child);
      await exited;
    }
  };
}

// Cliente HTTP mínimo que guarda o cookie de sessão como um navegador.
function httpClient(baseUrl) {
  let cookie = '';
  async function call(method, route, body) {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(cookie ? { cookie } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie && setCookie.startsWith('session=')) cookie = setCookie.split(';')[0];
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: response.status, body: json };
  }
  return {
    get: (route) => call('GET', route),
    post: (route, body = {}) => call('POST', route, body),
    put: (route, body = {}) => call('PUT', route, body)
  };
}

module.exports = {
  childEnvironment,
  copyProject,
  freePort,
  httpClient,
  projectDir,
  removeDirectory,
  runNode,
  runNpmScript,
  startServer
};
