function createApprovalsRepository(db) {
  return {
    createRequest(input) {
      return db
        .prepare(
          `INSERT INTO approval_requests
          (type,requester_user_id,employee_id,justification,technical_report,expires_at)
          VALUES(?,?,?,?,?,?)`
        )
        .run(
          input.type,
          input.requesterUserId,
          input.employeeId,
          input.justification,
          input.technicalReport,
          input.expiresAt
        ).lastInsertRowid;
    },
    addAsset(requestId, assetId, role, expectedStatus) {
      db.prepare(
        'INSERT INTO approval_request_assets(request_id,asset_id,role,expected_status) VALUES(?,?,?,?)'
      ).run(requestId, assetId, role, expectedStatus);
    },
    reserve(assetId, requestId) {
      db.prepare('INSERT INTO approval_asset_reservations(asset_id,request_id) VALUES(?,?)').run(
        assetId,
        requestId
      );
    },
    reservationForAsset(assetId) {
      return db
        .prepare('SELECT request_id FROM approval_asset_reservations WHERE asset_id=?')
        .get(assetId);
    },
    release(requestId) {
      db.prepare('DELETE FROM approval_asset_reservations WHERE request_id=?').run(requestId);
    },
    addAttachments(requestId, attachments) {
      const statement = db.prepare(
        'INSERT INTO approval_request_attachments(request_id,name,url) VALUES(?,?,?)'
      );
      for (const attachment of attachments)
        statement.run(requestId, attachment.name, attachment.url);
    },
    addEvent(requestId, eventType, actorUserId, details = {}, movementId = null) {
      db.prepare(
        'INSERT INTO approval_request_events(request_id,event_type,actor_user_id,details,movement_id) VALUES(?,?,?,?,?)'
      ).run(requestId, eventType, actorUserId, JSON.stringify(details), movementId);
    },
    findById(id) {
      return db.prepare('SELECT * FROM approval_requests WHERE id=?').get(id);
    },
    assets(requestId) {
      return db
        .prepare(
          `SELECT ra.*,a.status current_status,a.equipment_type,a.hostname,a.serial
          FROM approval_request_assets ra JOIN assets a ON a.id=ra.asset_id WHERE ra.request_id=?`
        )
        .all(requestId);
    },
    details(id) {
      const request = this.findById(id);
      if (!request) return null;
      return {
        ...request,
        assets: this.assets(id),
        attachments: db
          .prepare('SELECT name,url FROM approval_request_attachments WHERE request_id=?')
          .all(id),
        events: db
          .prepare('SELECT * FROM approval_request_events WHERE request_id=? ORDER BY id')
          .all(id)
      };
    },
    list(filters, requesterUserId = null) {
      let sql = `SELECT r.*,u.name requester_name FROM approval_requests r
        JOIN users u ON u.id=r.requester_user_id WHERE 1=1`;
      const params = [];
      for (const column of ['status', 'type', 'requester_user_id']) {
        const value = filters[column];
        if (value !== undefined) {
          sql += ` AND r.${column}=?`;
          params.push(value);
        }
      }
      if (requesterUserId) {
        sql += ' AND r.requester_user_id=?';
        params.push(requesterUserId);
      }
      const total = db.prepare(`SELECT COUNT(*) count FROM (${sql})`).get(...params).count;
      const items = db
        .prepare(`${sql} ORDER BY r.created_at DESC,r.id DESC LIMIT ? OFFSET ?`)
        .all(...params, filters.pageSize, (filters.page - 1) * filters.pageSize);
      return { items, total };
    },
    decide(id, status, approverId, reason) {
      db.prepare(
        `UPDATE approval_requests SET status=?,approved_by_user_id=?,decision_reason=?,
        decided_at=?,updated_at=? WHERE id=?`
      ).run(status, approverId, reason, new Date().toISOString(), new Date().toISOString(), id);
    },
    cancel(id) {
      db.prepare("UPDATE approval_requests SET status='CANCELADA',updated_at=? WHERE id=?").run(
        new Date().toISOString(),
        id
      );
    },
    expirePending() {
      return db
        .prepare(
          "SELECT id,requester_user_id FROM approval_requests WHERE status='PENDENTE' AND expires_at<=?"
        )
        .all(new Date().toISOString());
    },
    markExpired(id) {
      db.prepare("UPDATE approval_requests SET status='EXPIRADA',updated_at=? WHERE id=?").run(
        new Date().toISOString(),
        id
      );
    },
    markExecuted(id) {
      db.prepare('UPDATE approval_requests SET executed_at=?,updated_at=? WHERE id=?').run(
        new Date().toISOString(),
        new Date().toISOString(),
        id
      );
    },
    notify(userId, type, title, body) {
      db.prepare('INSERT INTO user_notifications(user_id,type,title,body) VALUES(?,?,?,?)').run(
        userId,
        type,
        title,
        body
      );
    },
    pendingCount() {
      return db
        .prepare(
          "SELECT COUNT(*) count FROM approval_requests WHERE status='PENDENTE' AND expires_at>? "
        )
        .get(new Date().toISOString()).count;
    },
    notifications(userId) {
      return db
        .prepare(
          'SELECT * FROM user_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50'
        )
        .all(userId);
    }
  };
}
module.exports = { createApprovalsRepository };
