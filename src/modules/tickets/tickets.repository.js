function createTicketsRepository(db) {
  return {
    list() {
      return db
        .prepare(
          `SELECT tk.*,e.name employee_name,e.city,e.department,a.hostname,a.serial,a.equipment_type,
          u.name responsible_user FROM tickets tk
          JOIN employees e ON e.id=tk.employee_id
          LEFT JOIN assets a ON a.id=tk.asset_id
          LEFT JOIN users u ON u.id=tk.responsible_user_id
          ORDER BY tk.opened_at DESC LIMIT 300`
        )
        .all();
    },
    create(input) {
      return db
        .prepare(
          `INSERT INTO tickets
          (ticket_number,employee_id,asset_id,type,priority,description,status,responsible_user_id)
          VALUES(?,?,?,?,?,?,?,?)`
        )
        .run(
          input.ticketNumber,
          input.employeeId,
          input.assetId,
          input.type,
          input.priority,
          input.description,
          'open',
          input.responsibleUserId
        ).lastInsertRowid;
    }
  };
}

module.exports = { createTicketsRepository };
