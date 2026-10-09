function createMovementsRepository(db) {
  return {
    create(input) {
      db.prepare(
        `INSERT INTO movements
        (asset_id,employee_from_id,employee_to_id,from_status,to_status,
        movement_type,reason,technician_id) VALUES(?,?,?,?,?,?,?,?)`
      ).run(
        input.assetId,
        input.fromEmployeeId,
        input.toEmployeeId,
        input.fromStatus,
        input.toStatus,
        input.type,
        input.reason,
        input.technicianId
      );
    },
    listAssetHistory(assetId) {
      return db
        .prepare(
          `SELECT m.*,t.name technician,ef.name employee_from,et.name employee_to
          FROM movements m LEFT JOIN technicians t ON t.id=m.technician_id
          LEFT JOIN employees ef ON ef.id=m.employee_from_id
          LEFT JOIN employees et ON et.id=m.employee_to_id
          WHERE asset_id=? ORDER BY created_at DESC`
        )
        .all(assetId);
    }
  };
}

module.exports = { createMovementsRepository };
