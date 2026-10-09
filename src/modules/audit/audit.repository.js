function createAuditRepository(db) {
  return {
    log(actor, action, entityType, entityId, details) {
      db.prepare(
        'INSERT INTO audit_log(actor,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)'
      ).run(actor, action, entityType, entityId, details);
    },
    listRecent() {
      return db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500').all();
    }
  };
}

module.exports = { createAuditRepository };
