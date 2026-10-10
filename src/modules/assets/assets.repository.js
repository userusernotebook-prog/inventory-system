const { likeContains } = require('../../shared/utils/query');
const { registerScopeFunction, scopeCondition } = require('../../db/scope');

const SORT_COLUMNS = {
  hostname: 'a.hostname',
  equipment_type: 'a.equipment_type',
  model: 'a.model',
  serial: 'a.serial',
  status: 'a.status',
  updated_at: 'a.updated_at'
};
// Alcance do ativo: cidade e tipo do próprio ativo; departamento de quem está com ele.
const ASSET_SCOPE = {
  city: 'a.city',
  equipment_type: 'a.equipment_type',
  department: 'e.department'
};
// Quem está com o ativo só é exibido se também estiver no alcance.
const HOLDER_SCOPE = { city: 'e.city', department: 'e.department' };
const JOINS = ` FROM assets a
  LEFT JOIN assignments s ON s.asset_id=a.id AND s.returned_at IS NULL
  LEFT JOIN employees e ON e.id=s.employee_id`;

function createAssetsRepository(db) {
  registerScopeFunction(db);
  return {
    list(options, scopes = [], { holderSearch = true } = {}) {
      const where = [];
      const params = [];
      const holder = scopeCondition(scopes, HOLDER_SCOPE);
      if (options.q) {
        const like = likeContains(options.q);
        let search =
          "a.serial LIKE ? ESCAPE '\\' OR a.hostname LIKE ? ESCAPE '\\' OR a.model LIKE ? ESCAPE '\\' OR a.reference LIKE ? ESCAPE '\\'";
        const searchParams = Array(4).fill(like);
        if (holderSearch) {
          search += ` OR (e.name LIKE ? ESCAPE '\\' AND ${holder.sql})`;
          searchParams.push(like, ...holder.params);
        }
        where.push(`(${search})`);
        params.push(...searchParams);
      }
      for (const field of ['status', 'city', 'equipment_type']) {
        if (options[field]) {
          where.push(`a.${field}=?`);
          params.push(options[field]);
        }
      }
      const scope = scopeCondition(scopes, ASSET_SCOPE);
      where.push(scope.sql);
      params.push(...scope.params);
      const clause = ` WHERE ${where.join(' AND ')}`;
      const sort = SORT_COLUMNS[options.sortBy] || 'a.updated_at';
      const direction = options.sortOrder === 'asc' ? 'ASC' : 'DESC';
      const total = db
        .prepare(`SELECT count(DISTINCT a.id) count${JOINS}${clause}`)
        .get(...params).count;
      const items = db
        .prepare(
          `SELECT a.*,e.id employee_id,e.name employee_name,e.department employee_department,
          (${holder.sql}) holder_in_scope${JOINS}${clause}
          ORDER BY ${sort} ${direction},a.id DESC LIMIT ? OFFSET ?`
        )
        .all(...holder.params, ...params, options.pageSize, (options.page - 1) * options.pageSize);
      return { items, total };
    },
    // Sem alcance (undefined), devolve o ativo sem filtro: uso interno de regras.
    findById(id, scopes) {
      const holder = scopeCondition(scopes || [], HOLDER_SCOPE);
      const scope = scopeCondition(scopes || [], ASSET_SCOPE);
      return db
        .prepare(
          `SELECT a.*,e.id employee_id,e.name employee_name,e.department employee_department,
          (${holder.sql}) holder_in_scope${JOINS} WHERE a.id=? AND ${scope.sql}`
        )
        .get(...holder.params, id, ...scope.params);
    },
    create(input) {
      const now = new Date().toISOString();
      const result = db
        .prepare(
          `INSERT INTO assets
          (hostname,equipment_type,manufacturer,model,serial,description,imei1,imei2,
          apple_id,reference,condition_text,city,location,acquisition_value,status,activated_at,replaced_at,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          input.hostname,
          input.equipment_type,
          input.manufacturer,
          input.model,
          input.serial,
          input.description,
          input.imei1,
          input.imei2,
          input.apple_id,
          input.reference,
          input.condition_text,
          input.city,
          input.location,
          input.acquisition_value,
          input.status,
          input.activated_at,
          input.replaced_at,
          now,
          now
        );
      return result.lastInsertRowid;
    },
    update(id, input) {
      db.prepare(
        `UPDATE assets SET hostname=?,equipment_type=?,manufacturer=?,model=?,serial=?,description=?,
          imei1=?,imei2=?,apple_id=?,reference=?,condition_text=?,city=?,location=?,acquisition_value=?,updated_at=? WHERE id=?`
      ).run(
        input.hostname,
        input.equipment_type,
        input.manufacturer,
        input.model,
        input.serial,
        input.description,
        input.imei1,
        input.imei2,
        input.apple_id,
        input.reference,
        input.condition_text,
        input.city,
        input.location,
        input.acquisition_value,
        new Date().toISOString(),
        id
      );
    },
    updateStatus(id, status, retirementReason) {
      db.prepare('UPDATE assets SET status=?,retirement_reason=?,updated_at=? WHERE id=?').run(
        status,
        retirementReason,
        new Date().toISOString(),
        id
      );
    }
  };
}

module.exports = { createAssetsRepository };
