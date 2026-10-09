function createTicketsRepository(db) {
  return {
    list() {
      return db
        .prepare(
          `SELECT tk.*,e.name employee_name,a.hostname,a.serial,a.equipment_type,
          t.name technician FROM tickets tk
          JOIN employees e ON e.id=tk.employee_id
          LEFT JOIN assets a ON a.id=tk.asset_id
          LEFT JOIN technicians t ON t.id=tk.technician_id
          ORDER BY tk.opened_at DESC LIMIT 300`
        )
        .all();
    },
    create(input) {
      return db
        .prepare(
          `INSERT INTO tickets
          (ticket_number,employee_id,asset_id,type,priority,description,status,technician_id)
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
          input.technicianId
        ).lastInsertRowid;
    }
  };
}

module.exports = { createTicketsRepository };
