const { likeContains } = require('../../shared/utils/query');

function createAuthRepository(db) {
  return {
    findByEmail(email) {
      return db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE').get(email);
    },
    findById(id) {
      return db.prepare('SELECT * FROM users WHERE id=?').get(id);
    },
    findSession(hash) {
      return db
        .prepare(
          `SELECT u.id,u.name,u.email,u.profile_base,u.active,u.must_change_password,u.totp_enabled,
            s.id AS session_id,s.expires_at
          FROM sessions s JOIN users u ON u.id=s.user_id
          WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?`
        )
        .get(hash, new Date().toISOString());
    },
    createSession(hash, userId, expiresAt) {
      db.prepare(
        'INSERT INTO sessions(token_hash,user_id,expires_at,last_seen_at,created_at) VALUES(?,?,?,?,?)'
      ).run(hash, userId, expiresAt, new Date().toISOString(), new Date().toISOString());
    },
    revokeSessions(userId) {
      db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(
        new Date().toISOString(),
        userId
      );
    },
    revokeSession(sessionId) {
      db.prepare('UPDATE sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL').run(
        new Date().toISOString(),
        sessionId
      );
    },
    updateLogin(id) {
      db.prepare(
        'UPDATE users SET last_login_at=?,failed_login_attempts=0,locked_until=NULL WHERE id=?'
      ).run(new Date().toISOString(), id);
    },
    failLogin(id, attempts, lockedUntil) {
      db.prepare('UPDATE users SET failed_login_attempts=?,locked_until=? WHERE id=?').run(
        attempts,
        lockedUntil,
        id
      );
    },
    rolePermissions(profile) {
      return db
        .prepare('SELECT permission FROM role_permissions WHERE profile_base=?')
        .all(profile)
        .map((r) => r.permission);
    },
    overrides(id) {
      return db
        .prepare('SELECT permission,effect FROM user_permission_overrides WHERE user_id=?')
        .all(id);
    },
    scopes(id) {
      return db.prepare('SELECT scope_type,scope_value FROM user_scopes WHERE user_id=?').all(id);
    },
    countAdmins() {
      return db.prepare("SELECT COUNT(*) n FROM users WHERE profile_base='ADMIN'").get().n;
    },
    createUser(input) {
      return db
        .prepare(
          'INSERT INTO users(name,email,password_hash,profile_base,active,must_change_password,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)'
        )
        .run(
          input.name,
          input.email,
          input.passwordHash,
          input.profileBase,
          input.active ? 1 : 0,
          input.mustChangePassword ? 1 : 0,
          new Date().toISOString(),
          new Date().toISOString()
        ).lastInsertRowid;
    },
    updateUser(id, input) {
      db.prepare(
        'UPDATE users SET name=?,email=?,profile_base=?,active=?,updated_at=? WHERE id=?'
      ).run(
        input.name,
        input.email,
        input.profileBase,
        input.active ? 1 : 0,
        new Date().toISOString(),
        id
      );
    },
    resetPassword(id, passwordHash) {
      db.prepare(
        'UPDATE users SET password_hash=?,must_change_password=1,totp_enabled=0,totp_secret=NULL,failed_login_attempts=0,locked_until=NULL,updated_at=? WHERE id=?'
      ).run(passwordHash, new Date().toISOString(), id);
    },
    changePassword(id, passwordHash) {
      db.prepare(
        'UPDATE users SET password_hash=?,must_change_password=0,updated_at=? WHERE id=?'
      ).run(passwordHash, new Date().toISOString(), id);
    },
    setTotp(id, secret, enabled) {
      db.prepare('UPDATE users SET totp_secret=?,totp_enabled=? WHERE id=?').run(
        secret,
        enabled ? 1 : 0,
        id
      );
    },
    setOverrides(id, rows) {
      db.prepare('DELETE FROM user_permission_overrides WHERE user_id=?').run(id);
      const stmt = db.prepare(
        'INSERT INTO user_permission_overrides(user_id,permission,effect) VALUES(?,?,?)'
      );
      for (const row of rows) stmt.run(id, row.permission, row.effect);
    },
    setScopes(id, rows) {
      db.prepare('DELETE FROM user_scopes WHERE user_id=?').run(id);
      const stmt = db.prepare(
        'INSERT INTO user_scopes(user_id,scope_type,scope_value) VALUES(?,?,?)'
      );
      for (const row of rows) stmt.run(id, row.type, row.value);
    },
    listUsers(options) {
      const where = [];
      const params = [];
      if (options.q) {
        where.push("(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')");
        params.push(likeContains(options.q), likeContains(options.q));
      }
      for (const field of ['profile_base', 'active']) {
        if (options[field] !== undefined) {
          where.push(`${field}=?`);
          params.push(options[field]);
        }
      }
      const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
      const allowed = new Set(['name', 'email', 'profile_base', 'last_login_at']);
      const sort = allowed.has(options.sortBy) ? options.sortBy : 'name';
      const direction = options.sortOrder === 'desc' ? 'DESC' : 'ASC';
      const total = db.prepare(`SELECT count(*) count FROM users${clause}`).get(...params).count;
      const items = db
        .prepare(
          `SELECT id,name,email,profile_base,active,last_login_at,must_change_password,totp_enabled FROM users${clause} ORDER BY ${sort} ${direction},id ASC LIMIT ? OFFSET ?`
        )
        .all(...params, options.pageSize, (options.page - 1) * options.pageSize);
      return { items, total };
    }
  };
}
module.exports = { createAuthRepository };
