function createAuditRepository(db) {
  return {
    log(actor, action, entityType, entityId, details, actorUserId = null) {
      db.prepare(
        'INSERT INTO audit_log(actor,action,entity_type,entity_id,details,actor_user_id) VALUES(?,?,?,?,?,?)'
      ).run(actor, action, entityType, entityId, details, actorUserId);
    },
    listRecent() {
      return db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500').all();
    }
  };
}

module.exports = { createAuditRepository };
