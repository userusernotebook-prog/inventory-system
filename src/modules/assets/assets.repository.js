const { likeContains } = require('../../shared/utils/query');

const SORT_COLUMNS = {
  hostname: 'a.hostname',
  equipment_type: 'a.equipment_type',
  model: 'a.model',
  serial: 'a.serial',
  status: 'a.status',
  updated_at: 'a.updated_at'
};

function createAssetsRepository(db) {
  return {
    list(options, scopes = []) {
      const where = ['1=1'];
      const params = [];
      if (options.q) {
        where.push(
          "(a.serial LIKE ? ESCAPE '\\' OR a.hostname LIKE ? ESCAPE '\\' OR a.model LIKE ? ESCAPE '\\' OR a.reference LIKE ? ESCAPE '\\' OR e.name LIKE ? ESCAPE '\\')"
        );
        params.push(...Array(5).fill(likeContains(options.q)));
      }
      for (const field of ['status', 'city', 'equipment_type']) {
        if (options[field]) {
          where.push(`a.${field}=?`);
          params.push(options[field]);
        }
      }
      for (const scopeType of ['city', 'equipment_type']) {
        const values = scopes
          .filter((scope) => scope.scope_type === scopeType)
          .map((scope) => scope.scope_value);
        if (values.length) {
          where.push(`lower(a.${scopeType}) IN (${values.map(() => 'lower(?)').join(',')})`);
          params.push(...values);
        }
      }
      const departments = scopes
        .filter((scope) => scope.scope_type === 'department')
        .map((scope) => scope.scope_value);
      if (departments.length) {
        where.push(
          `lower(COALESCE(e.department,'')) IN (${departments.map(() => 'lower(?)').join(',')})`
        );
        params.push(...departments);
      }
      const joins = ` FROM assets a
        LEFT JOIN assignments s ON s.asset_id=a.id AND s.returned_at IS NULL
        LEFT JOIN employees e ON e.id=s.employee_id`;
      const clause = ` WHERE ${where.join(' AND ')}`;
      const sort = SORT_COLUMNS[options.sortBy] || 'a.updated_at';
      const direction = options.sortOrder === 'asc' ? 'ASC' : 'DESC';
      const total = db
        .prepare(`SELECT count(DISTINCT a.id) count${joins}${clause}`)
        .get(...params).count;
      const items = db
        .prepare(
          `SELECT a.*,e.id employee_id,e.name employee_name,e.department employee_department${joins}${clause}
          ORDER BY ${sort} ${direction},a.id DESC LIMIT ? OFFSET ?`
        )
        .all(...params, options.pageSize, (options.page - 1) * options.pageSize);
      return { items, total };
    },
    findById(id) {
      return db
        .prepare(
          `SELECT a.*,e.department employee_department FROM assets a
          LEFT JOIN assignments s ON s.asset_id=a.id AND s.returned_at IS NULL
          LEFT JOIN employees e ON e.id=s.employee_id WHERE a.id=?`
        )
        .get(id);
    },
    create(input) {
      const now = new Date().toISOString();
      const result = db
        .prepare(
          `INSERT INTO assets
          (hostname,equipment_type,manufacturer,model,serial,description,imei1,imei2,
          apple_id,reference,condition_text,city,location,status,activated_at,replaced_at,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
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
          imei1=?,imei2=?,apple_id=?,reference=?,condition_text=?,city=?,location=?,updated_at=? WHERE id=?`
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
