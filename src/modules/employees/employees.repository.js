const { likeContains } = require('../../shared/utils/query');

const SORT_COLUMNS = {
  name: 'name',
  email: 'email',
  department: 'department',
  city: 'city',
  status: 'status',
  created_at: 'created_at'
};

function addScope(sql, params, scopes) {
  for (const type of ['city', 'department']) {
    const values = scopes
      .filter((scope) => scope.scope_type === type)
      .map((scope) => scope.scope_value);
    if (values.length) {
      sql.push(`lower(${type}) IN (${values.map(() => 'lower(?)').join(',')})`);
      params.push(...values);
    }
  }
}

function createEmployeesRepository(db) {
  return {
    list(options, scopes = []) {
      const where = [];
      const params = [];
      if (options.q) {
        where.push(
          "(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR department LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\')"
        );
        params.push(...Array(4).fill(likeContains(options.q)));
      }
      for (const field of ['status', 'city', 'department']) {
        if (options[field]) {
          where.push(`${field}=?`);
          params.push(options[field]);
        }
      }
      addScope(where, params, scopes);
      const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
      const sort = SORT_COLUMNS[options.sortBy] || 'created_at';
      const direction = options.sortOrder === 'asc' ? 'ASC' : 'DESC';
      const total = db
        .prepare(`SELECT count(*) count FROM employees${clause}`)
        .get(...params).count;
      const items = db
        .prepare(
          `SELECT * FROM employees${clause} ORDER BY ${sort} ${direction}, id DESC LIMIT ? OFFSET ?`
        )
        .all(...params, options.pageSize, (options.page - 1) * options.pageSize);
      return { items, total };
    },
    findById(id) {
      return db.prepare('SELECT * FROM employees WHERE id=?').get(id);
    },
    listEvents(employeeId) {
      return db
        .prepare(
          `SELECT event.id,event.event_type,event.details,event.created_at,u.name actor_name
          FROM employee_events event
          LEFT JOIN users u ON u.id=event.actor_user_id
          WHERE event.employee_id=? ORDER BY event.id DESC`
        )
        .all(employeeId);
    },
    findActiveById(id) {
      return db.prepare("SELECT * FROM employees WHERE id=? AND status='ativo'").get(id);
    },
    findCodeDuplicate(code, id = 0) {
      return db
        .prepare('SELECT id FROM employees WHERE code=? COLLATE NOCASE AND id<>?')
        .get(code, id);
    },
    create(input) {
      const now = new Date().toISOString();
      const result = db
        .prepare(
          `INSERT INTO employees
          (code,name,email,city,department,location,corporate_phone,personal_phone,hire_date,status,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          input.code,
          input.name,
          input.email,
          input.city,
          input.department,
          input.location,
          input.corporate_phone,
          input.personal_phone,
          input.hire_date,
          input.status,
          now,
          now
        );
      return result.lastInsertRowid;
    },
    update(id, input) {
      db.prepare(
        `UPDATE employees SET code=@code,name=@name,email=@email,department=@department,
          cost_center=@cost_center,city=@city,location=@location,
          corporate_phone=@corporate_phone,personal_phone=@personal_phone,
          hire_date=@hire_date,offboarded_at=@offboarded_at,
          updated_at=@updated_at WHERE id=@id`
      ).run({ ...input, id, updated_at: new Date().toISOString() });
    }
  };
}

module.exports = { createEmployeesRepository };
