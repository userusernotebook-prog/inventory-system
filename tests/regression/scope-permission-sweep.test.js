// Rodada 2, item 5: varredura de TODAS as rotas GET por alcance e por permissão.
//
// Dados dentro do alcance levam "DENTRO"; fora do alcance, "FORA" (inclusive em
// cidade, departamento e tipo). Nomes de funcionários começam com "EMP-",
// chamados com "TKT-" e o valor de aquisição é 987654.32.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { generate } = require('otplib');
const { createApp } = require('../../src/app');
const { PERMISSIONS, ADMIN_ONLY_PERMISSIONS } = require('../../src/modules/auth/permissions');
const { createIntegrationContext, createUser, login } = require('../helpers/integration-context');

const password = 'SenhaDeTesteForte1';
const totpSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const VALUE = '987654.32';

// Rotas GET registradas no app, com a permissão exigida (marcada pelo middleware).
function getRoutes(app) {
  const routes = [];
  const walk = (stack) => {
    for (const layer of stack) {
      if (layer.route) {
        if (!layer.route.methods.get) continue;
        const required = layer.route.stack
          .map((entry) => entry.handle.requiredPermission)
          .find(Boolean);
        routes.push({ path: layer.route.path, permission: required || 'authenticated' });
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk(app.router.stack);
  // Swagger é montado com app.use (não é rota); entra na varredura explicitamente.
  routes.push({ path: '/api/docs/', permission: 'audit:read' });
  return routes.filter((route) => route.path.startsWith('/api'));
}

function seed(db, ids) {
  const employee = (name, city, department) =>
    Number(
      db
        .prepare(
          "INSERT INTO employees(name,email,city,department,status,personal_phone) VALUES(?,?,?,?,'ativo','8199999')"
        )
        .run(name, `${name.toLowerCase()}@x.test`.replace(/[^a-z0-9@.-]/g, ''), city, department)
        .lastInsertRowid
    );
  const asset = (serial, type, city, holder, value = null) => {
    const id = Number(
      db
        .prepare(
          "INSERT INTO assets(equipment_type,serial,hostname,city,status,acquisition_value) VALUES(?,?,?,?,'EM_USO',?)"
        )
        .run(type, serial, `host-${serial}`, city, value).lastInsertRowid
    );
    db.prepare(
      'INSERT INTO assignments(asset_id,employee_id,responsible_user_id) VALUES(?,?,NULL)'
    ).run(id, holder);
    db.prepare(
      "INSERT INTO movements(asset_id,employee_to_id,from_status,to_status,movement_type,reason,occurred_at) VALUES(?,?,'DISPONIVEL','EM_USO','ATRIBUICAO',?,?)"
    ).run(id, holder, `mov-${serial}`, new Date().toISOString());
    return id;
  };
  const ticket = (number, description, type, employeeId, assetId) =>
    db
      .prepare(
        "INSERT INTO tickets(ticket_number,employee_id,asset_id,type,description,status,opened_at,updated_at) VALUES(?,?,?,?,?,'open',?,?)"
      )
      .run(
        number,
        employeeId,
        assetId,
        type,
        description,
        new Date().toISOString(),
        new Date().toISOString()
      );

  const inside = employee('EMP-DENTRO-1', 'Recife', 'TI');
  const outCity = employee('EMP-FORA-CIDADE', 'CidadeFORA', 'TI');
  const outDept = employee('EMP-FORA-DEPTO', 'Recife', 'DeptFORA');
  const assetIn = asset('AST-DENTRO-1', 'Notebook', 'Recife', inside, VALUE);
  const assetMixed = asset('AST-DENTRO-MISTO', 'Notebook', 'Recife', outCity);
  const assetOutCity = asset('AST-FORA-CIDADE', 'Notebook', 'CidadeFORA', outCity);
  const assetOutType = asset('AST-FORA-TIPO', 'TipoFORA', 'Recife', inside);
  const assetOutDept = asset('AST-FORA-DEPTO', 'Notebook', 'Recife', outDept);
  ticket('CH-DENTRO-1', 'TKT-DENTRO-1', 'Hardware', inside, assetIn);
  ticket('CH-FORA-1', 'TKT-FORA-CIDADE', 'CategoriaFORA', outCity, assetOutCity);
  ticket('CH-FORA-2', 'TKT-FORA-TIPO', 'CategoriaFORA', inside, assetOutType);
  ticket('CH-FORA-3', 'TKT-FORA-DEPTO', 'CategoriaFORA', outDept, assetOutDept);
  ticket('CH-FORA-4', 'TKT-FORA-SEM-ATIVO', 'CategoriaFORA', inside, null);
  // Cadastro pela API registra o nome na auditoria: dado fora do alcance também ali.
  db.prepare(
    "INSERT INTO audit_log(actor,action,entity_type,entity_id,details,created_at) VALUES('Admin','create','employee',?,?,?)"
  ).run(outCity, JSON.stringify({ after: { name: 'EMP-FORA-CIDADE' } }), new Date().toISOString());
  Object.assign(ids, {
    employee: { inside: [inside], outside: [outCity, outDept] },
    asset: { inside: [assetIn, assetMixed], outside: [assetOutCity, assetOutType, assetOutDept] }
  });
}

async function scenario(t) {
  const context = createIntegrationContext();
  t.after(() => context.close());
  const { db } = context;
  const app = createApp(db);
  const ids = {};
  seed(db, ids);
  const admin = await createUser(db, { name: 'Admin', email: 'admin@x.test', profile: 'ADMIN' });
  db.prepare('UPDATE users SET totp_secret=?,totp_enabled=1 WHERE id=?').run(totpSecret, admin.id);
  let sequence = 0;
  async function userWith({ profile = 'TECNICO', allow = [], deny = [], scopes = [] }) {
    sequence += 1;
    const user = await createUser(db, {
      name: `Usuario ${sequence}`,
      email: `usuario${sequence}@x.test`,
      profile
    });
    const override = db.prepare(
      'INSERT INTO user_permission_overrides(user_id,permission,effect) VALUES(?,?,?)'
    );
    for (const permission of allow) override.run(user.id, permission, 'allow');
    for (const permission of deny) override.run(user.id, permission, 'deny');
    for (const [type, value] of scopes)
      db.prepare('INSERT INTO user_scopes(user_id,scope_type,scope_value) VALUES(?,?,?)').run(
        user.id,
        type,
        value
      );
    const session = request.agent(app);
    const response = await login(session, user.email, password);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return { ...user, session };
  }
  const adminSession = request.agent(app);
  let adminLogin = await login(
    adminSession,
    admin.email,
    password,
    await generate({ secret: totpSecret })
  );
  // Se o primeiro código foi gerado no fim da janela TOTP, gere um novo
  // código. Sem esta checagem o teste continuava com uma sessão anônima e
  // escondia a causa real do erro.
  if (adminLogin.status === 401) {
    adminLogin = await login(
      adminSession,
      admin.email,
      password,
      await generate({ secret: totpSecret })
    );
  }
  assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.body));

  // Solicitação de outra pessoa sobre ativo fora do alcance.
  const foreign = await adminSession.post('/api/approval-requests').send({
    type: 'DESATIVACAO_ATIVO',
    asset_id: ids.asset.outside[1],
    justification: 'Solicitação FORA do alcance',
    technical_report: 'Laudo FORA'
  });
  assert.equal(foreign.status, 201, JSON.stringify(foreign.body));
  ids.request = { inside: [], outside: [foreign.body.id] };
  ids.user = { inside: [], outside: [admin.id] };
  return { app, db, ids, userWith };
}

function pathsFor(route, ids, side) {
  if (!route.path.includes(':')) return [route.path];
  const kind = route.path.startsWith('/api/employees/')
    ? 'employee'
    : route.path.startsWith('/api/assets/')
      ? 'asset'
      : route.path.startsWith('/api/approval-requests/')
        ? 'request'
        : route.path.startsWith('/api/users/')
          ? 'user'
          : null;
  assert.ok(kind, `rota GET sem mapeamento de parâmetro na varredura: ${route.path}`);
  return ids[kind][side].map((id) => route.path.replace(':id', id));
}

const bodyText = (response) =>
  response.type === 'application/json' ? JSON.stringify(response.body) : response.text || '';

test('alcance: nenhuma rota GET mostra dado fora do alcance do usuário', async (t) => {
  const s = await scenario(t);
  // Todas as permissões que podem ser concedidas: o alcance precisa valer em todas as rotas.
  const scoped = await s.userWith({
    allow: PERMISSIONS.filter((permission) => !ADMIN_ONLY_PERMISSIONS.includes(permission)),
    scopes: [
      ['city', 'Recife'],
      ['department', 'TI'],
      ['equipment_type', 'Notebook']
    ]
  });
  const own = await scoped.session.post('/api/approval-requests').send({
    type: 'DESATIVACAO_ATIVO',
    asset_id: s.ids.asset.inside[0],
    justification: 'Solicitação DENTRO do alcance',
    technical_report: 'Laudo DENTRO'
  });
  assert.equal(own.status, 201, JSON.stringify(own.body));
  s.ids.request.inside.push(own.body.id);

  const leaks = [];
  for (const route of getRoutes(s.app)) {
    for (const side of ['inside', 'outside']) {
      for (const path of pathsFor(route, s.ids, side)) {
        const response = await scoped.session.get(path);
        if (bodyText(response).includes('FORA')) leaks.push(`${path} (${response.status})`);
        if (side === 'outside' && route.path.includes(':') && response.status === 200)
          leaks.push(`${path} respondeu 200 para registro fora do alcance`);
      }
    }
  }
  assert.deepEqual(leaks, []);

  // Sanidade: o filtro não esconde o que está dentro do alcance.
  const expected = {
    '/api/employees': 'EMP-DENTRO-1',
    '/api/assets': 'AST-DENTRO-MISTO',
    '/api/tickets': 'TKT-DENTRO-1',
    '/api/dashboard': 'AST-DENTRO-1',
    [`/api/employees/${s.ids.employee.inside[0]}/assets`]: 'AST-DENTRO-1',
    [`/api/employees/${s.ids.employee.inside[0]}/offboarding/checklist`]: 'AST-DENTRO-1'
  };
  for (const [path, marker] of Object.entries(expected)) {
    const response = await scoped.session.get(path);
    assert.equal(response.status, 200, `${path}: ${JSON.stringify(response.body)}`);
    assert.ok(bodyText(response).includes(marker), `${path} deveria mostrar ${marker}`);
  }
});

test('permissão: para cada rota GET, quem não tem a permissão exigida recebe 403 sem dados', async (t) => {
  const s = await scenario(t);
  const routes = getRoutes(s.app);
  // Só a rota do próprio usuário dispensa permissão; as demais precisam declarar a sua.
  assert.deepEqual(
    routes.filter((route) => route.permission === 'authenticated').map((route) => route.path),
    ['/api/auth/me']
  );
  const grantable = PERMISSIONS.filter(
    (permission) => !ADMIN_ONLY_PERMISSIONS.includes(permission)
  );
  const failures = [];
  const required = [...new Set(routes.map((route) => route.permission))].filter(
    (permission) => permission !== 'authenticated'
  );
  for (const permission of required) {
    const user = await s.userWith({
      allow: grantable.filter((item) => item !== permission),
      deny: [permission]
    });
    for (const route of routes.filter((item) => item.permission === permission)) {
      for (const path of pathsFor(route, s.ids, 'inside').concat(
        pathsFor(route, s.ids, 'outside')
      )) {
        const response = await user.session.get(path);
        const text = bodyText(response);
        if (response.status !== 403 || /DENTRO|FORA|EMP-|TKT-/.test(text))
          failures.push(`${path} sem ${permission}: ${response.status}`);
      }
    }
  }
  const nobody = await s.userWith({
    profile: 'CONSULTA',
    deny: ['asset:read', 'employee:read', 'ticket:read']
  });
  for (const route of routes.filter((item) => item.path !== '/api/auth/me')) {
    for (const path of pathsFor(route, s.ids, 'inside').concat(pathsFor(route, s.ids, 'outside'))) {
      const response = await nobody.session.get(path);
      if (response.status !== 403)
        failures.push(`${path} sem nenhuma permissão: ${response.status}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('dados sensíveis: nomes, valores e chamados só aparecem com a permissão correspondente', async (t) => {
  const s = await scenario(t);
  const routes = getRoutes(s.app);
  const grantable = PERMISSIONS.filter(
    (permission) => !ADMIN_ONLY_PERMISSIONS.includes(permission)
  );
  const cases = [
    ['employee:read', /EMP-/],
    ['asset:view_value', /987654/],
    ['ticket:read', /TKT-|CH-DENTRO|CH-FORA/]
  ];
  const leaks = [];
  for (const [permission, marker] of cases) {
    const user = await s.userWith({
      allow: grantable.filter((item) => item !== permission),
      deny: [permission]
    });
    for (const route of routes) {
      for (const path of pathsFor(route, s.ids, 'inside').concat(
        pathsFor(route, s.ids, 'outside')
      )) {
        const response = await user.session.get(path);
        if (marker.test(bodyText(response))) leaks.push(`${path} mostra dado de ${permission}`);
      }
    }
  }
  assert.deepEqual(leaks, []);
});

test('dashboard mostra contagens no alcance e nomes só com employee:read', async (t) => {
  const s = await scenario(t);
  const financial = await s.userWith({ profile: 'FINANCEIRO', scopes: [['city', 'Recife']] });
  const summary = await financial.session.get('/api/dashboard');
  assert.equal(summary.status, 200, JSON.stringify(summary.body));
  // Recife: AST-DENTRO-1, AST-DENTRO-MISTO, AST-FORA-TIPO, AST-FORA-DEPTO.
  assert.equal(summary.body.counts.assigned, 4);
  assert.equal(summary.body.counts.employees, 2);
  assert.doesNotMatch(JSON.stringify(summary.body), /EMP-|CidadeFORA|AST-FORA-CIDADE/);
  const report = await financial.session.get('/api/dashboard/report');
  assert.equal(report.status, 200, JSON.stringify(report.body));
  assert.doesNotMatch(JSON.stringify(report.body), /EMP-|TKT-|CidadeFORA|AST-FORA-CIDADE/);
});
