function createOffboardingRepository(db) {
  return {
    start(employeeId, date, reason) {
      db.prepare(
        `UPDATE employees SET status='em_desligamento',offboarding_reason=?,offboarding_started_at=?,
        offboarded_at=?,updated_at=? WHERE id=?`
      ).run(reason, new Date().toISOString(), date, new Date().toISOString(), employeeId);
    },
    complete(employeeId) {
      db.prepare("UPDATE employees SET status='desligado',updated_at=? WHERE id=?").run(
        new Date().toISOString(),
        employeeId
      );
    },
    event(employeeId, type, actorId, details = {}) {
      db.prepare(
        'INSERT INTO employee_events(employee_id,event_type,actor_user_id,details) VALUES(?,?,?,?)'
      ).run(employeeId, type, actorId, JSON.stringify(details));
    },
    addReceipt(input) {
      db.prepare(
        `INSERT INTO asset_receipts(asset_id,employee_id,received_by_user_id,received_at,physical_condition,accessories)
        VALUES(?,?,?,?,?,?)`
      ).run(
        input.assetId,
        input.employeeId,
        input.userId,
        input.receivedAt,
        input.condition,
        input.accessories
      );
    },
    findReceipt(assetId) {
      return db
        .prepare('SELECT * FROM asset_receipts WHERE asset_id=? ORDER BY id DESC LIMIT 1')
        .get(assetId);
    },
    assignedAssets(employeeId) {
      return db
        .prepare(
          `SELECT a.* FROM assets a JOIN assignments ass ON ass.asset_id=a.id AND ass.returned_at IS NULL
        WHERE ass.employee_id=?`
        )
        .all(employeeId);
    },
    checklist(employeeId) {
      const counts = db
        .prepare(
          `SELECT a.status,COUNT(*) count FROM assets a
        LEFT JOIN assignments ass ON ass.asset_id=a.id AND ass.returned_at IS NULL
        WHERE ass.employee_id=? OR a.id IN (SELECT asset_id FROM asset_receipts WHERE employee_id=?)
        GROUP BY a.status`
        )
        .all(employeeId, employeeId);
      return Object.fromEntries(counts.map((row) => [row.status, row.count]));
    },
    openTickets(employeeId) {
      return db
        .prepare("SELECT * FROM tickets WHERE employee_id=? AND status IN ('open','in_progress')")
        .all(employeeId);
    },
    closeTicket(id) {
      db.prepare("UPDATE tickets SET status='closed',closed_at=?,updated_at=? WHERE id=?").run(
        new Date().toISOString(),
        new Date().toISOString(),
        id
      );
    },
    reassignTicket(id, employeeId) {
      db.prepare('UPDATE tickets SET employee_id=?,updated_at=? WHERE id=?').run(
        employeeId,
        new Date().toISOString(),
        id
      );
    },
    pendingDeactivation(employeeId) {
      return db
        .prepare(
          "SELECT COUNT(*) count FROM approval_requests WHERE employee_id=? AND type='DESATIVACAO_ATIVO' AND status='PENDENTE'"
        )
        .get(employeeId).count;
    },
    events(employeeId) {
      return db
        .prepare('SELECT * FROM employee_events WHERE employee_id=? ORDER BY id')
        .all(employeeId);
    }
  };
}
module.exports = { createOffboardingRepository };
