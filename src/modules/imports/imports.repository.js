function createImportsRepository(db) {
  return {
    employeesByCode(code) {
      return db
        .prepare('SELECT id,name,status FROM employees WHERE code=? COLLATE NOCASE')
        .all(code);
    },
    insertTemplateEmployee(input) {
      return db
        .prepare(
          `INSERT INTO employees
          (code,name,email,department,cost_center,city,location,corporate_phone,
          personal_phone,status,hire_date,offboarded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          input.code,
          input.name,
          input.email,
          input.department,
          input.costCenter,
          input.city,
          input.location,
          input.corporatePhone,
          input.personalPhone,
          input.status,
          input.hireDate,
          input.offboardedAt
        ).lastInsertRowid;
    },
    hasSerial(serial) {
      return Boolean(db.prepare('SELECT id FROM assets WHERE serial=? COLLATE NOCASE').get(serial));
    },
    hasReference(reference) {
      return Boolean(
        db.prepare('SELECT id FROM assets WHERE reference=? COLLATE NOCASE').get(reference)
      );
    },
    insertTemplateAsset(input) {
      return db
        .prepare(
          `INSERT INTO assets
          (equipment_type,hostname,manufacturer,model,serial,reference,description,
          imei1,imei2,apple_id,condition_text,city,location,status,retirement_reason)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          input.type,
          input.hostname,
          input.manufacturer,
          input.model,
          input.serial,
          input.reference,
          input.description,
          input.imei1,
          input.imei2,
          input.appleId,
          input.conditionText,
          input.city,
          input.location,
          input.status,
          input.retirementReason
        ).lastInsertRowid;
    },
    insertAssignment(assetId, employeeId, responsibleUserId) {
      db.prepare(
        'INSERT INTO assignments(asset_id,employee_id,responsible_user_id) VALUES(?,?,?)'
      ).run(assetId, employeeId, responsibleUserId);
    },
    insertInitialMovement(assetId, employeeId, status, reason, technicalReport, responsibleUserId) {
      db.prepare(
        `INSERT INTO movements
        (asset_id,employee_to_id,from_status,to_status,movement_type,reason,
        responsible_user_id,technical_report,occurred_at)
        VALUES(?,?, 'DISPONIVEL',?,'IMPORTACAO_INICIAL',?,?,?,?)`
      ).run(
        assetId,
        employeeId,
        status,
        reason,
        responsibleUserId,
        technicalReport,
        new Date().toISOString()
      );
    },
    findEmployeeByName(name) {
      return db.prepare('SELECT id FROM employees WHERE name=? COLLATE NOCASE').get(name);
    },
    insertLegacyEmployee(code, name, city, department) {
      return db
        .prepare("INSERT INTO employees(code,name,city,department,status) VALUES(?,?,?,?,'ativo')")
        .run(code, name, city, department).lastInsertRowid;
    },
    legacyAssetExists(serial, hostname) {
      return Boolean(
        db
          .prepare('SELECT id FROM assets WHERE serial=? OR (hostname=? AND hostname IS NOT NULL)')
          .get(serial, hostname)
      );
    },
    insertLegacyAsset(input) {
      return db
        .prepare(
          `INSERT INTO assets
          (hostname,equipment_type,manufacturer,model,serial,description,imei1,imei2,
          apple_id,reference,condition_text,city,location,activated_at,replaced_at,status)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'DISPONIVEL')`
        )
        .run(
          input.hostname,
          input.type,
          input.manufacturer,
          input.model,
          input.serial,
          input.description,
          input.imei1,
          input.imei2,
          input.appleId,
          input.reference,
          input.conditionText,
          input.city,
          input.location,
          input.activatedAt,
          input.replacedAt
        ).lastInsertRowid;
    },
    assignLegacyAsset(assetId, employeeId, responsibleUserId) {
      db.prepare(
        'INSERT INTO assignments(asset_id,employee_id,responsible_user_id) VALUES(?,?,?)'
      ).run(assetId, employeeId, responsibleUserId);
      db.prepare("UPDATE assets SET status='EM_USO' WHERE id=?").run(assetId);
    },
    findLegacyAsset(value) {
      return db.prepare('SELECT id FROM assets WHERE serial=? OR hostname=?').get(value, value);
    },
    insertLegacyTicket(input) {
      db.prepare(
        `INSERT INTO tickets
        (ticket_number,employee_id,asset_id,type,priority,description,status,
        technical_opinion,opened_at,closed_at,responsible_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        input.ticketNumber,
        input.employeeId,
        input.assetId,
        input.type,
        input.priority,
        input.description,
        input.status,
        input.technicalOpinion,
        input.openedAt,
        input.closedAt,
        input.responsibleUserId
      );
    }
  };
}

module.exports = { createImportsRepository };
