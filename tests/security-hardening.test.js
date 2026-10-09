const test = require('node:test');
const assert = require('node:assert/strict');
const employeeSchema = require('../src/modules/employees/employees.schema');
const approvalSchema = require('../src/modules/approvals/approvals.schema');
const { requestSecurity } = require('../src/shared/middlewares/security');
const { createAssetsService } = require('../src/modules/assets/assets.service');
const { ForbiddenError } = require('../src/shared/errors');

function runRequestSecurity(headers = {}) {
  let nextError;
  const result = requestSecurity(
    { path: '/api/assets', get: (name) => headers[name.toLowerCase()] },
    { setHeader() {} },
    (error) => {
      nextError = error;
    }
  );
  return { result, nextError };
}

test('rejeita manipulação de campos controlados pelo servidor no cadastro e em aprovações', () => {
  assert.equal(
    employeeSchema.create.safeParse({ name: 'Pessoa', status: 'desligado' }).success,
    false
  );
  assert.equal(
    approvalSchema.create.safeParse({
      type: 'DESATIVACAO_ATIVO',
      asset_id: 1,
      justification: 'Motivo válido',
      technical_report: 'Laudo técnico',
      requester_user_id: 999,
      approved_by_user_id: 999,
      status: 'APROVADA'
    }).success,
    false
  );
});

test('bloqueia origem cruzada e mantém compatibilidade para clientes sem cabeçalho Origin', () => {
  const hostile = runRequestSecurity({ origin: 'https://attacker.example' });
  assert.ok(hostile.nextError instanceof ForbiddenError);
  const internal = runRequestSecurity();
  assert.equal(internal.nextError, undefined);
});

test('protege detalhe do ativo contra IDOR ao aplicar alcance no serviço', () => {
  const service = createAssetsService(
    null,
    { findById: () => ({ id: 7, city: 'Rio de Janeiro' }) },
    { logUser() {} },
    {
      assertScope() {
        throw new ForbiddenError('Seu alcance não permite acessar este registro.');
      }
    }
  );
  assert.throws(() => service.get(7, { id: 2 }), /alcance/);
});

test('rotas críticas de aprovação exigem permissão granular, sem apenas autenticação', () => {
  const source = require('node:fs').readFileSync(
    require('node:path').resolve(__dirname, '../src/modules/approvals/approvals.routes.js'),
    'utf8'
  );
  assert.match(source, /\/cancel',[\s\S]*requirePermission\(authService, 'request:create'\)/);
  assert.match(
    source,
    /\/notifications',[\s\S]*requirePermission\(authService, 'request:create'\)/
  );
});
