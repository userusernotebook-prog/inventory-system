const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'inventory.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS technicians (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'technician' CHECK(role IN ('technician','admin')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS employees (
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
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  offboarded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hostname TEXT,
  equipment_type TEXT NOT NULL,
  manufacturer TEXT,
  model TEXT,
  serial TEXT,
  description TEXT,
  imei1 TEXT,
  imei2 TEXT,
  apple_id TEXT,
  reference TEXT,
  condition_text TEXT,
  city TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'backup' CHECK(status IN ('assigned','backup','maintenance','retired')),
  retirement_reason TEXT,
  activated_at TEXT,
  replaced_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_serial_unique ON assets(serial) WHERE serial IS NOT NULL AND serial <> '';
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_hostname ON assets(hostname);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  returned_at TEXT,
  technician_id INTEGER,
  FOREIGN KEY(asset_id) REFERENCES assets(id),
  FOREIGN KEY(employee_id) REFERENCES employees(id),
  FOREIGN KEY(technician_id) REFERENCES technicians(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_assignment_per_asset ON assignments(asset_id) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assignment_employee ON assignments(employee_id, returned_at);

CREATE TABLE IF NOT EXISTS movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  employee_from_id INTEGER,
  employee_to_id INTEGER,
  from_status TEXT,
  to_status TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  reason TEXT,
  technician_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(asset_id) REFERENCES assets(id),
  FOREIGN KEY(employee_from_id) REFERENCES employees(id),
  FOREIGN KEY(employee_to_id) REFERENCES employees(id),
  FOREIGN KEY(technician_id) REFERENCES technicians(id)
);
CREATE INDEX IF NOT EXISTS idx_movements_asset ON movements(asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_created ON movements(created_at DESC);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_number TEXT,
  employee_id INTEGER NOT NULL,
  asset_id INTEGER,
  type TEXT,
  priority TEXT,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','closed','cancelled')),
  technician_id INTEGER,
  technical_opinion TEXT,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(employee_id) REFERENCES employees(id),
  FOREIGN KEY(asset_id) REFERENCES assets(id),
  FOREIGN KEY(technician_id) REFERENCES technicians(id)
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_employee ON tickets(employee_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

// Bancos criados antes deste campo mantêm todos os registros existentes.
if (!db.pragma('table_info(employees)').some((column) => column.name === 'offboarded_at')) {
  db.exec('ALTER TABLE employees ADD COLUMN offboarded_at TEXT');
}
for (const column of ['cost_center', 'hire_date']) {
  if (!db.pragma('table_info(employees)').some((existing) => existing.name === column)) {
    db.exec(`ALTER TABLE employees ADD COLUMN ${column} TEXT`);
  }
}

const count = db.prepare('SELECT COUNT(*) c FROM technicians').get().c;
if (!count) {
  db.prepare("INSERT INTO technicians(name, role) VALUES (?, 'admin'), (?, 'technician')").run(
    'Administrador',
    'Técnico 1'
  );
}

module.exports = db;
