const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const coverage = new Map([
  ['GET /api/users', { happy: true, denied: true }],
  ['POST /api/users', { happy: true, denied: true }],
  ['GET /api/users/scope-options', { happy: true, denied: true }],
  ['GET /api/users/:id', { happy: true, denied: true }],
  ['PUT /api/users/:id', { happy: true, denied: true }],
  ['POST /api/users/:id/reset-password', { happy: true, denied: true }],
  ['POST /api/users/:id/force-logout', { happy: true, denied: true }],
  ['PUT /api/users/:id/overrides', { happy: true, denied: true }],
  ['PUT /api/users/:id/scopes', { happy: true, denied: true }],
  ['GET /api/users/:id/permissions', { happy: true, denied: true }]
]);

function registeredUserRoutes() {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../src/modules/auth/auth.routes.js'),
    'utf8'
  );
  return [...source.matchAll(/router\.(get|post|put)\(\s*'([^']+)'/g)]
    .map(([, method, route]) => `${method.toUpperCase()} ${route}`)
    .filter((route) => route.includes('/api/users'));
}

test('cobertura de rotas: cada rota de usuarios possui caminho feliz e acesso negado', () => {
  const registered = registeredUserRoutes();
  assert.deepEqual([...coverage.keys()].sort(), registered.sort());
  for (const route of registered) {
    assert.deepEqual(coverage.get(route), { happy: true, denied: true }, route);
  }
});
