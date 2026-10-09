function createAssignmentsRepository(db) {
  return {
    findOpenForAsset(assetId) {
      return db
        .prepare('SELECT * FROM assignments WHERE asset_id=? AND returned_at IS NULL')
        .get(assetId);
    },
    close(id) {
      db.prepare('UPDATE assignments SET returned_at=? WHERE id=?').run(
        new Date().toISOString(),
        id
      );
    },
    create(assetId, employeeId, responsibleUserId) {
      db.prepare(
        'INSERT INTO assignments(asset_id,employee_id,responsible_user_id) VALUES(?,?,?)'
      ).run(assetId, employeeId, responsibleUserId);
    },
    listEmployeeAssets(employeeId) {
      return db
        .prepare(
          `SELECT a.* FROM assets a JOIN assignments s
          ON s.asset_id=a.id AND s.returned_at IS NULL WHERE s.employee_id=?`
        )
        .all(employeeId);
    },
    listForOffboard(employeeId) {
      return db
        .prepare(
          `SELECT a.id,a.status FROM assets a JOIN assignments s
          ON s.asset_id=a.id AND s.returned_at IS NULL WHERE s.employee_id=?`
        )
        .all(employeeId);
    }
  };
}

module.exports = { createAssignmentsRepository };
