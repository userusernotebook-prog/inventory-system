CREATE TABLE employees_offboarding_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT,
  name TEXT NOT NULL,
  email TEXT,
  city TEXT,
  department TEXT,
  cost_center TEXT,
  hire_date TEXT,
  location TEXT,
  corporate_phone TEXT,
  personal_phone TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK(status IN ('ativo','em_desligamento','desligado')),
  offboarding_reason TEXT,
  offboarding_started_at TEXT,
  offboarded_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO employees_offboarding_new (
  id,code,name,email,city,department,cost_center,hire_date,location,corporate_phone,
  personal_phone,status,offboarded_at,created_at,updated_at
)
SELECT id,code,name,email,city,department,cost_center,hire_date,location,corporate_phone,
  personal_phone,CASE status WHEN 'active' THEN 'ativo' ELSE 'desligado' END,
  offboarded_at,created_at,updated_at FROM employees;
DROP TABLE employees;
ALTER TABLE employees_offboarding_new RENAME TO employees;
CREATE INDEX idx_employees_name ON employees(name);
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_employees_offboarding ON employees(status,offboarding_started_at);

CREATE TABLE employee_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  event_type TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL REFERENCES users(id),
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_employee_events_employee ON employee_events(employee_id,created_at);
CREATE TRIGGER employee_events_prevent_update BEFORE UPDATE ON employee_events BEGIN
  SELECT RAISE(ABORT, 'Eventos de funcionário são imutáveis.');
END;
CREATE TRIGGER employee_events_prevent_delete BEFORE DELETE ON employee_events BEGIN
  SELECT RAISE(ABORT, 'Eventos de funcionário são imutáveis.');
END;

CREATE TABLE asset_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  received_by_user_id INTEGER NOT NULL REFERENCES users(id),
  received_at TEXT NOT NULL,
  physical_condition TEXT NOT NULL,
  accessories TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_asset_receipts_asset ON asset_receipts(asset_id,created_at DESC);

INSERT OR IGNORE INTO role_permissions(profile_base,permission) VALUES
  ('RH','asset:mark-return-pending'),
  ('TECNICO','asset:send-backup'),
  ('TECNICO','asset:send-maintenance');
