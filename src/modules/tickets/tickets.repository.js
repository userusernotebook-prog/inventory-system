const { likeContains } = require('../../shared/utils/query');

const SORT_COLUMNS = {
  opened_at: 'tk.opened_at',
  priority: 'tk.priority',
  status: 'tk.status',
  ticket_number: 'tk.ticket_number'
};

function createTicketsRepository(db) {
  return {
    list(options, scopes = []) {
      const where = ['1=1'];
      const params = [];
      if (options.q) {
        where.push(
          "(tk.ticket_number LIKE ? ESCAPE '\\' OR tk.description LIKE ? ESCAPE '\\' OR e.name LIKE ? ESCAPE '\\')"
        );
        params.push(...Array(3).fill(likeContains(options.q)));
      }
      for (const field of ['status', 'priority', 'employee_id']) {
        if (options[field]) {
          where.push(`tk.${field}=?`);
          params.push(options[field]);
        }
      }
      for (const type of ['city', 'department']) {
        const values = scopes
          .filter((scope) => scope.scope_type === type)
          .map((scope) => scope.scope_value);
        if (values.length) {
          where.push(`lower(e.${type}) IN (${values.map(() => 'lower(?)').join(',')})`);
          params.push(...values);
        }
      }
      const joins = ` FROM tickets tk JOIN employees e ON e.id=tk.employee_id
        LEFT JOIN assets a ON a.id=tk.asset_id LEFT JOIN users u ON u.id=tk.responsible_user_id`;
      const clause = ` WHERE ${where.join(' AND ')}`;
      const total = db.prepare(`SELECT count(*) count${joins}${clause}`).get(...params).count;
      const sort = SORT_COLUMNS[options.sortBy] || 'tk.opened_at';
      const direction = options.sortOrder === 'asc' ? 'ASC' : 'DESC';
      const items = db
        .prepare(
          `SELECT tk.*,e.name employee_name,e.city,e.department,a.hostname,a.serial,a.equipment_type,
          u.name responsible_user${joins}${clause} ORDER BY ${sort} ${direction},tk.id DESC LIMIT ? OFFSET ?`
        )
        .all(...params, options.pageSize, (options.page - 1) * options.pageSize);
      return { items, total };
    },
    create(input) {
      const now = new Date().toISOString();
      return db
        .prepare(
          `INSERT INTO tickets
          (ticket_number,employee_id,asset_id,type,priority,description,status,responsible_user_id,opened_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          input.ticketNumber,
          input.employeeId,
          input.assetId,
          input.type,
          input.priority,
          input.description,
          'open',
          input.responsibleUserId,
          now,
          now
        ).lastInsertRowid;
    },
    findById(id) {
      return db
        .prepare(
          `SELECT tk.*, e.name employee_name, e.city, e.department
           FROM tickets tk JOIN employees e ON e.id=tk.employee_id
           WHERE tk.id=?`
        )
        .get(id);
    },
    close(id, technicalOpinion, responsibleUserId) {
      const now = new Date().toISOString();
      db.prepare(
        `UPDATE tickets
         SET status='closed', technical_opinion=?, responsible_user_id=?, closed_at=?, updated_at=?
         WHERE id=?`
      ).run(technicalOpinion, responsibleUserId, now, now, id);
    }
  };
}

module.exports = { createTicketsRepository };
