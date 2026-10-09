function createAuditRepository(db) {
  return {
    log(actor, action, entityType, entityId, details, actorUserId = null) {
      db.prepare(
        'INSERT INTO audit_log(actor,action,entity_type,entity_id,details,actor_user_id,created_at) VALUES(?,?,?,?,?,?,?)'
      ).run(actor, action, entityType, entityId, details, actorUserId, new Date().toISOString());
    },
    list(options) {
      const where = [];
      const params = [];
      for (const field of ['actor', 'action', 'entity_type']) {
        if (options[field]) {
          where.push(`${field}=?`);
          params.push(options[field]);
        }
      }
      const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
      const allowed = new Set(['created_at', 'actor', 'action', 'entity_type']);
      const sort = allowed.has(options.sortBy) ? options.sortBy : 'created_at';
      const direction = options.sortOrder === 'asc' ? 'ASC' : 'DESC';
      const total = db
        .prepare(`SELECT count(*) count FROM audit_log${clause}`)
        .get(...params).count;
      const items = db
        .prepare(
          `SELECT * FROM audit_log${clause} ORDER BY ${sort} ${direction},id DESC LIMIT ? OFFSET ?`
        )
        .all(...params, options.pageSize, (options.page - 1) * options.pageSize);
      return { items, total };
    }
  };
}

module.exports = { createAuditRepository };
