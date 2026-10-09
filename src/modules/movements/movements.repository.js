function createMovementsRepository(db) {
  return {
    create(input) {
      return db
        .prepare(
          `INSERT INTO movements
        (asset_id,employee_from_id,employee_to_id,from_status,to_status,
        movement_type,reason,technical_report,responsible_user_id,occurred_at,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          input.assetId,
          input.fromEmployeeId,
          input.toEmployeeId,
          input.fromStatus,
          input.toStatus,
          input.type,
          input.reason,
          input.technicalReport,
          input.responsibleUserId,
          input.occurredAt,
          new Date().toISOString()
        ).lastInsertRowid;
    },
    listAssetHistory(assetId) {
      return db
        .prepare(
          `SELECT m.*,COALESCE(m.occurred_at,m.created_at) occurred_at,
          u.name responsible_user,
          ef.name employee_from,et.name employee_to
          FROM movements m LEFT JOIN users u ON u.id=m.responsible_user_id
          LEFT JOIN employees ef ON ef.id=m.employee_from_id
          LEFT JOIN employees et ON et.id=m.employee_to_id
          WHERE asset_id=? ORDER BY occurred_at DESC`
        )
        .all(assetId);
    }
  };
}

module.exports = { createMovementsRepository };
