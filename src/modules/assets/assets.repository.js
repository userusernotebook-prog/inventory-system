function createAssetsRepository(db) {
  return {
    list(query, status) {
      let sql = `SELECT a.*,e.id employee_id,e.name employee_name,e.department employee_department
        FROM assets a
        LEFT JOIN assignments s ON s.asset_id=a.id AND s.returned_at IS NULL
        LEFT JOIN employees e ON e.id=s.employee_id WHERE 1=1`;
      const params = [];
      if (query) {
        sql += ` AND (a.serial LIKE ? OR a.hostname LIKE ? OR a.model LIKE ?
          OR a.reference LIKE ? OR e.name LIKE ?)`;
        for (let index = 0; index < 5; index++) params.push(`%${query}%`);
      }
      if (status) {
        sql += ' AND a.status=?';
        params.push(status);
      }
      sql += ' ORDER BY a.updated_at DESC LIMIT 500';
      return db.prepare(sql).all(...params);
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
      const result = db
        .prepare(
          `INSERT INTO assets
          (hostname,equipment_type,manufacturer,model,serial,description,imei1,imei2,
          apple_id,reference,condition_text,city,location,status,activated_at,replaced_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
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
          input.replaced_at
        );
      return result.lastInsertRowid;
    },
    update(id, input) {
      db.prepare(
        `UPDATE assets SET
          hostname=?,equipment_type=?,manufacturer=?,model=?,serial=?,description=?,
          imei1=?,imei2=?,apple_id=?,reference=?,condition_text=?,city=?,location=?,
          updated_at=CURRENT_TIMESTAMP WHERE id=?`
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
        id
      );
    },
    updateStatus(id, status, retirementReason) {
      db.prepare(
        'UPDATE assets SET status=?,retirement_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?'
      ).run(status, retirementReason, id);
    }
  };
}

module.exports = { createAssetsRepository };
