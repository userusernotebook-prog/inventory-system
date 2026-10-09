const apiKey = [{ sessionCookie: [] }];

function operation(permission, summary, extra = {}) {
  return {
    summary,
    security: apiKey,
    'x-required-permission': permission,
    responses: {
      200: { description: 'Sucesso' },
      400: { $ref: '#/components/responses/ValidationError' },
      401: { $ref: '#/components/responses/Unauthorized' },
      403: { $ref: '#/components/responses/Forbidden' },
      409: { $ref: '#/components/responses/Conflict' },
      500: { $ref: '#/components/responses/InternalError' }
    },
    ...extra
  };
}

const jsonBody = (schema) => ({
  required: true,
  content: { 'application/json': { schema } }
});
const identifier = [
  { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }
];

function buildOpenApi() {
  return {
    openapi: '3.0.3',
    info: { title: 'Inventário de Ativos de TI API', version: '1.1.0' },
    servers: [{ url: '/' }],
    paths: {
      '/api/auth/login': {
        post: operation('pública', 'Inicia a sessão', {
          security: [],
          requestBody: jsonBody({ $ref: '#/components/schemas/Login' })
        })
      },
      '/api/auth/logout': { post: operation('authenticated', 'Encerra a sessão') },
      '/api/auth/me': { get: operation('authenticated', 'Retorna o usuário atual') },
      '/api/auth/change-password': {
        post: operation('authenticated', 'Altera a senha provisória', {
          requestBody: jsonBody({ $ref: '#/components/schemas/Password' })
        })
      },
      '/api/auth/totp/setup': { post: operation('authenticated', 'Inicia configuração de 2FA') },
      '/api/auth/totp/confirm': {
        post: operation('authenticated', 'Confirma o 2FA', {
          requestBody: jsonBody({
            type: 'object',
            required: ['code'],
            properties: { code: { type: 'string' } }
          })
        })
      },
      '/api/employees': {
        get: operation('employee:read', 'Lista funcionários', { parameters: paginationParameters }),
        post: operation('employee:create', 'Cria funcionário', {
          requestBody: jsonBody({ $ref: '#/components/schemas/Employee' })
        })
      },
      '/api/employees/{id}': {
        get: operation('employee:read', 'Consulta funcionário', { parameters: identifier }),
        put: operation('employee:update', 'Atualiza funcionário', {
          parameters: identifier,
          requestBody: jsonBody({ $ref: '#/components/schemas/Employee' })
        })
      },
      '/api/employees/{id}/assets': {
        get: operation('asset:read', 'Lista ativos do funcionário', { parameters: identifier })
      },
      '/api/employees/{id}/offboarding/start': {
        post: operation('employee:offboard', 'Inicia desligamento', { parameters: identifier })
      },
      '/api/employees/{id}/offboarding/conclude': {
        post: operation('employee:offboard', 'Conclui desligamento', { parameters: identifier })
      },
      '/api/employees/{id}/offboarding/checklist': {
        get: operation('employee:offboard', 'Consulta checklist de desligamento', {
          parameters: identifier
        })
      },
      '/api/assets': {
        get: operation('asset:read', 'Lista ativos', { parameters: paginationParameters }),
        post: operation('asset:create', 'Cria ativo', {
          requestBody: jsonBody({ $ref: '#/components/schemas/Asset' })
        })
      },
      '/api/assets/{id}': {
        put: operation('asset:update', 'Atualiza ativo', {
          parameters: identifier,
          requestBody: jsonBody({ $ref: '#/components/schemas/Asset' })
        })
      },
      '/api/assets/{id}/history': {
        get: operation('asset:read', 'Histórico do ativo', { parameters: identifier })
      },
      '/api/assets/{id}/move': {
        post: operation('asset:update', 'Move ativo', { parameters: identifier })
      },
      '/api/offboarding/assets/{id}/receive': {
        post: operation('asset:receive', 'Recebe ativo do desligamento', { parameters: identifier })
      },
      '/api/offboarding/assets/{id}/destination': {
        post: operation('asset:update', 'Define destino do ativo', { parameters: identifier })
      },
      '/api/tickets': {
        get: operation('ticket:read', 'Lista chamados', { parameters: paginationParameters }),
        post: operation('ticket:create', 'Cria chamado')
      },
      '/api/approval-requests': {
        get: operation('request:create', 'Lista solicitações', {
          parameters: paginationParameters
        }),
        post: operation('request:create', 'Cria solicitação')
      },
      '/api/approval-requests/{id}': {
        get: operation('request:create', 'Detalha solicitação', { parameters: identifier })
      },
      '/api/approval-requests/{id}/approve': {
        post: operation('request:approve', 'Aprova solicitação', { parameters: identifier })
      },
      '/api/approval-requests/{id}/reject': {
        post: operation('request:approve', 'Rejeita solicitação', { parameters: identifier })
      },
      '/api/approval-requests/{id}/cancel': {
        post: operation('authenticated', 'Cancela solicitação', { parameters: identifier })
      },
      '/api/approval-requests/pending-count': {
        get: operation('request:approve', 'Conta solicitações pendentes')
      },
      '/api/notifications': { get: operation('authenticated', 'Lista notificações') },
      '/api/dashboard': { get: operation('asset:read', 'Resumo operacional') },
      '/api/dashboard/report': { get: operation('asset:read', 'Relatório operacional') },
      '/api/admin/audit': {
        get: operation('audit:read', 'Lista auditoria', { parameters: paginationParameters })
      },
      '/api/users': {
        get: operation('user:manage', 'Lista usuários', { parameters: paginationParameters }),
        post: operation('user:manage', 'Cria usuário')
      },
      '/api/users/{id}': {
        put: operation('user:manage', 'Atualiza usuário', { parameters: identifier })
      },
      '/api/users/{id}/reset-password': {
        post: operation('user:manage', 'Redefine senha', { parameters: identifier })
      },
      '/api/users/{id}/force-logout': {
        post: operation('user:manage', 'Encerra sessões', { parameters: identifier })
      },
      '/api/users/{id}/overrides': {
        put: operation('user:manage', 'Define permissões individuais', { parameters: identifier })
      },
      '/api/users/{id}/scopes': {
        put: operation('user:manage', 'Define alcance', { parameters: identifier })
      },
      '/api/users/{id}/permissions': {
        get: operation('user:manage', 'Consulta permissões efetivas', { parameters: identifier })
      },
      '/api/templates/initial': { get: operation('asset:create', 'Baixa o modelo de importação') },
      '/api/import/excel': { post: operation('asset:create', 'Importa planilha') }
    },
    components: {
      securitySchemes: { sessionCookie: { type: 'apiKey', in: 'cookie', name: 'session' } },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'details'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { nullable: true }
              }
            }
          }
        },
        Login: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 1 },
            totp_code: { type: 'string' }
          }
        },
        Password: {
          type: 'object',
          required: ['password'],
          properties: { password: { type: 'string', minLength: 12, maxLength: 256 } }
        },
        Employee: {
          type: 'object',
          properties: {
            code: { type: 'string', maxLength: 64 },
            name: { type: 'string', maxLength: 160 },
            email: { type: 'string', format: 'email' },
            city: { type: 'string' },
            department: { type: 'string' }
          }
        },
        Asset: {
          type: 'object',
          required: ['equipment_type'],
          properties: {
            equipment_type: { type: 'string', maxLength: 100 },
            serial: { type: 'string', maxLength: 160 },
            hostname: { type: 'string', maxLength: 120 },
            status: { type: 'string' }
          }
        }
      },
      responses: {
        ValidationError: {
          description: 'Dados inválidos',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
        },
        Unauthorized: { description: 'Sessão ausente ou expirada' },
        Forbidden: { description: 'Permissão insuficiente' },
        Conflict: { description: 'Conflito de dados' },
        InternalError: { description: 'Erro interno sem detalhes técnicos' }
      }
    }
  };
}

const paginationParameters = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  {
    name: 'pageSize',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 }
  },
  { name: 'sortBy', in: 'query', schema: { type: 'string' } },
  {
    name: 'sortOrder',
    in: 'query',
    schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }
  }
];

module.exports = { buildOpenApi };
