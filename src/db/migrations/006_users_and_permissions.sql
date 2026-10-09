CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  profile_base TEXT NOT NULL CHECK(profile_base IN ('ADMIN','TECNICO','RH','FINANCEIRO','CONSULTA')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  last_login_at TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK(must_change_password IN (0,1)),
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0 CHECK(totp_enabled IN (0,1)),
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users(id,name,email,password_hash,profile_base,active,must_change_password)
SELECT id,name,lower('legacy-user-' || id || '@local.invalid'),'MIGRATION_REQUIRES_RESET',
  CASE WHEN role='admin' THEN 'ADMIN' ELSE 'TECNICO' END,active,1
FROM technicians;
CREATE UNIQUE INDEX idx_one_admin ON users(profile_base) WHERE profile_base='ADMIN';
CREATE INDEX idx_users_active_email ON users(active,email);

CREATE TABLE role_permissions (
  profile_base TEXT NOT NULL CHECK(profile_base IN ('ADMIN','TECNICO','RH','FINANCEIRO','CONSULTA')),
  permission TEXT NOT NULL,
  PRIMARY KEY(profile_base,permission)
);
INSERT INTO role_permissions(profile_base,permission) VALUES
('ADMIN','*:*'),
('TECNICO','asset:read'),('TECNICO','asset:create'),('TECNICO','asset:update'),('TECNICO','asset:receive'),('TECNICO','asset:evaluate'),('TECNICO','request:create'),('TECNICO','ticket:read'),('TECNICO','ticket:create'),('TECNICO','employee:read'),
('RH','employee:read'),('RH','employee:create'),('RH','employee:update'),('RH','employee:offboard'),('RH','asset:read'),('RH','request:create'),
('FINANCEIRO','asset:read'),('FINANCEIRO','asset:view_value'),('FINANCEIRO','report:financial'),
('CONSULTA','asset:read'),('CONSULTA','employee:read'),('CONSULTA','ticket:read');

CREATE TABLE user_permission_overrides (
  user_id INTEGER NOT NULL,
  permission TEXT NOT NULL,
  effect TEXT NOT NULL CHECK(effect IN ('allow','deny')),
  PRIMARY KEY(user_id,permission),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE user_scopes (
  user_id INTEGER NOT NULL,
  scope_type TEXT NOT NULL CHECK(scope_type IN ('city','department','equipment_type')),
  scope_value TEXT NOT NULL,
  PRIMARY KEY(user_id,scope_type,scope_value),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX idx_sessions_user ON sessions(user_id,expires_at);

CREATE TABLE assignments_users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  returned_at TEXT,
  responsible_user_id INTEGER,
  FOREIGN KEY(asset_id) REFERENCES assets(id),
  FOREIGN KEY(employee_id) REFERENCES employees(id),
  FOREIGN KEY(responsible_user_id) REFERENCES users(id)
);
INSERT INTO assignments_users_new(id,asset_id,employee_id,assigned_at,returned_at,responsible_user_id)
SELECT id,asset_id,employee_id,assigned_at,returned_at,technician_id FROM assignments;
DROP TABLE assignments;
ALTER TABLE assignments_users_new RENAME TO assignments;
CREATE UNIQUE INDEX idx_one_open_assignment_per_asset ON assignments(asset_id) WHERE returned_at IS NULL;
CREATE INDEX idx_assignment_employee ON assignments(employee_id,returned_at);

CREATE TABLE movements_users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL, employee_from_id INTEGER, employee_to_id INTEGER,
  from_status TEXT, to_status TEXT NOT NULL, movement_type TEXT NOT NULL,
  reason TEXT, technical_report TEXT, responsible_user_id INTEGER,
  occurred_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(asset_id) REFERENCES assets(id),
  FOREIGN KEY(employee_from_id) REFERENCES employees(id), FOREIGN KEY(employee_to_id) REFERENCES employees(id),
  FOREIGN KEY(responsible_user_id) REFERENCES users(id)
);
INSERT INTO movements_users_new(id,asset_id,employee_from_id,employee_to_id,from_status,to_status,movement_type,reason,technical_report,responsible_user_id,occurred_at,created_at)
SELECT id,asset_id,employee_from_id,employee_to_id,from_status,to_status,movement_type,reason,technical_report,COALESCE(responsible_technician_id,technician_id),occurred_at,created_at FROM movements;
DROP TABLE movements;
ALTER TABLE movements_users_new RENAME TO movements;
CREATE INDEX idx_movements_asset ON movements(asset_id,occurred_at DESC);
CREATE INDEX idx_movements_occurred ON movements(occurred_at DESC);
CREATE TRIGGER movements_prevent_update BEFORE UPDATE ON movements BEGIN SELECT RAISE(ABORT,'Movimentações são imutáveis.'); END;
CREATE TRIGGER movements_prevent_delete BEFORE DELETE ON movements BEGIN SELECT RAISE(ABORT,'Movimentações são imutáveis.'); END;

CREATE TABLE tickets_users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_number TEXT, employee_id INTEGER NOT NULL, asset_id INTEGER,
  type TEXT, priority TEXT, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  responsible_user_id INTEGER, technical_opinion TEXT, opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(employee_id) REFERENCES employees(id), FOREIGN KEY(asset_id) REFERENCES assets(id),
  FOREIGN KEY(responsible_user_id) REFERENCES users(id)
);
INSERT INTO tickets_users_new(id,ticket_number,employee_id,asset_id,type,priority,description,status,responsible_user_id,technical_opinion,opened_at,closed_at,updated_at)
SELECT id,ticket_number,employee_id,asset_id,type,priority,description,status,technician_id,technical_opinion,opened_at,closed_at,updated_at FROM tickets;
DROP TABLE tickets;
ALTER TABLE tickets_users_new RENAME TO tickets;
CREATE INDEX idx_tickets_status ON tickets(status); CREATE INDEX idx_tickets_employee ON tickets(employee_id);

ALTER TABLE audit_log ADD COLUMN actor_user_id INTEGER REFERENCES users(id);
DROP TABLE technicians;
