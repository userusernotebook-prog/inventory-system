CREATE TABLE approval_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('TROCA_EQUIPAMENTO','USO_EQUIPAMENTO_BACKUP','DESATIVACAO_ATIVO')),
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE','APROVADA','REJEITADA','CANCELADA','EXPIRADA')),
  requester_user_id INTEGER NOT NULL REFERENCES users(id),
  employee_id INTEGER REFERENCES employees(id),
  justification TEXT NOT NULL,
  technical_report TEXT,
  decision_reason TEXT,
  approved_by_user_id INTEGER REFERENCES users(id),
  expires_at TEXT NOT NULL,
  decided_at TEXT,
  executed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_approval_requests_status ON approval_requests(status, expires_at);
CREATE INDEX idx_approval_requests_requester ON approval_requests(requester_user_id, created_at DESC);

CREATE TABLE approval_request_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES approval_requests(id),
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  role TEXT NOT NULL CHECK(role IN ('PRIMARY','OLD','NEW')),
  expected_status TEXT NOT NULL,
  UNIQUE(request_id, asset_id)
);

CREATE TABLE approval_asset_reservations (
  asset_id INTEGER PRIMARY KEY REFERENCES assets(id),
  request_id INTEGER NOT NULL REFERENCES approval_requests(id),
  reserved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE approval_request_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES approval_requests(id),
  name TEXT NOT NULL,
  url TEXT NOT NULL
);

CREATE TABLE approval_request_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES approval_requests(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('CRIADA','APROVADA','REJEITADA','CANCELADA','EXECUTADA','EXPIRADA')),
  actor_user_id INTEGER REFERENCES users(id),
  details TEXT NOT NULL DEFAULT '{}',
  movement_id INTEGER REFERENCES movements(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_approval_events_request ON approval_request_events(request_id, created_at);
CREATE TRIGGER approval_events_prevent_update BEFORE UPDATE ON approval_request_events BEGIN
  SELECT RAISE(ABORT, 'Eventos de aprovação são imutáveis.');
END;
CREATE TRIGGER approval_events_prevent_delete BEFORE DELETE ON approval_request_events BEGIN
  SELECT RAISE(ABORT, 'Eventos de aprovação são imutáveis.');
END;

CREATE TABLE user_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_notifications_user ON user_notifications(user_id, read_at, created_at DESC);
