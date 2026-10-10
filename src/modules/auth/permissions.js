// Catálogo das permissões que o sistema verifica. Permissões individuais só
// podem usar estes nomes: coringas como *:* ficam restritos ao perfil ADMIN.
const PERMISSIONS = Object.freeze([
  'asset:read',
  'asset:create',
  'asset:update',
  'asset:view_value',
  'asset:assign',
  'asset:transfer',
  'asset:receive',
  'asset:mark-return-pending',
  'asset:send-backup',
  'asset:send-maintenance',
  'asset:return-maintenance',
  'asset:evaluate',
  'asset:deactivate',
  'employee:read',
  'employee:create',
  'employee:update',
  'employee:offboard',
  'ticket:read',
  'ticket:create',
  'ticket:close',
  'request:create',
  'request:approve',
  'user:manage',
  'audit:read',
  // Carga inicial: importar ativos já EM_USO/DESATIVADO e a planilha legada.
  'import:initial_load'
]);

// Exclusivas do ADMIN: nunca concedidas por perfil ou permissão individual.
// audit:read entra aqui porque a auditoria (e o status de backup e a
// documentação da API) não tem alcance: só o admin, que não tem alcance, a lê.
const ADMIN_ONLY_PERMISSIONS = Object.freeze(['user:manage', 'request:approve', 'audit:read']);

const known = new Set(PERMISSIONS);
const adminOnly = new Set(ADMIN_ONLY_PERMISSIONS);

module.exports = {
  ADMIN_ONLY_PERMISSIONS,
  PERMISSIONS,
  isAdminOnly: (permission) => adminOnly.has(permission),
  isKnownPermission: (permission) => known.has(permission)
};
