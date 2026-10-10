// Única definição do alcance (cidade, departamento, tipo de equipamento).
//
// Regras:
// - Cada tipo de alcance configurado precisa casar, quando se aplica ao registro.
// - Um tipo não se aplica quando o registro não tem esse atributo (ex.: tipo de
//   equipamento para funcionário). Atributo existente mas vazio não casa.
// - O admin não tem alcance (o service passa lista vazia).
//
// Os repositories usam scopeCondition para filtrar no SQL; o service usa
// matchesScope apenas para validar dados novos que ainda não estão no banco.
const SCOPE_TYPES = Object.freeze(['city', 'department', 'equipment_type']);

function normalize(value) {
  return String(value ?? '')
    .normalize('NFC')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

const registered = new WeakSet();
// A mesma normalização do JavaScript vale no SQL (lower() do SQLite só trata ASCII).
function registerScopeFunction(db) {
  if (registered.has(db)) return;
  db.function('scope_norm', { deterministic: true }, (value) => normalize(value));
  registered.add(db);
}

function allowedByType(scopes = []) {
  const byType = new Map();
  for (const scope of scopes) {
    if (!SCOPE_TYPES.includes(scope.scope_type)) continue;
    const values = byType.get(scope.scope_type) || [];
    values.push(normalize(scope.scope_value));
    byType.set(scope.scope_type, values);
  }
  return byType;
}

// columns: { city: 'a.city', department: 'e.department', equipment_type: 'a.equipment_type' }
// Retorna { sql, params } com as condições unidas por AND ('1=1' sem alcance).
function scopeCondition(scopes, columns) {
  const conditions = [];
  const params = [];
  for (const [type, allowed] of allowedByType(scopes)) {
    const column = columns[type];
    if (!column) continue;
    conditions.push(`scope_norm(${column}) IN (${allowed.map(() => '?').join(',')})`);
    params.push(...allowed);
  }
  return { sql: conditions.length ? conditions.join(' AND ') : '1=1', params };
}

// values: { city, department, equipment_type } apenas com os atributos que o
// registro possui (undefined = não se aplica).
function matchesScope(scopes, values) {
  for (const [type, allowed] of allowedByType(scopes)) {
    if (values[type] === undefined) continue;
    if (!allowed.includes(normalize(values[type]))) return false;
  }
  return true;
}

module.exports = { SCOPE_TYPES, matchesScope, normalize, registerScopeFunction, scopeCondition };
