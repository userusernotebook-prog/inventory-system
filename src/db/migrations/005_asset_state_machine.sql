CREATE TABLE IF NOT EXISTS asset_state_machine_005_rollback_states (
  asset_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assets_state_machine_new (
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
  status TEXT NOT NULL DEFAULT 'DISPONIVEL' CHECK(status IN (
    'DISPONIVEL', 'EM_USO', 'PENDENTE_DEVOLUCAO', 'EM_AVALIACAO',
    'BACKUP', 'EM_MANUTENCAO', 'DESATIVADO'
  )),
  retirement_reason TEXT,
  activated_at TEXT,
  replaced_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO assets_state_machine_new (
  id, hostname, equipment_type, manufacturer, model, serial, description, imei1,
  imei2, apple_id, reference, condition_text, city, location, status,
  retirement_reason, activated_at, replaced_at, created_at, updated_at
)
SELECT
  id, hostname, equipment_type, manufacturer, model, serial, description, imei1,
  imei2, apple_id, reference, condition_text, city, location,
  CASE status
    WHEN 'assigned' THEN 'EM_USO'
    WHEN 'backup' THEN 'BACKUP'
    WHEN 'maintenance' THEN 'EM_MANUTENCAO'
    WHEN 'retired' THEN 'DESATIVADO'
    ELSE 'DISPONIVEL'
  END,
  retirement_reason, activated_at, replaced_at, created_at, updated_at
FROM assets;

UPDATE assets_state_machine_new
SET status = (
  SELECT rollback.status
  FROM asset_state_machine_005_rollback_states rollback
  WHERE rollback.asset_id = assets_state_machine_new.id
)
WHERE id IN (
  SELECT asset_id
  FROM asset_state_machine_005_rollback_states
  WHERE status IN (
    'DISPONIVEL', 'EM_USO', 'PENDENTE_DEVOLUCAO', 'EM_AVALIACAO',
    'BACKUP', 'EM_MANUTENCAO', 'DESATIVADO'
  )
);

DROP TABLE assets;
ALTER TABLE assets_state_machine_new RENAME TO assets;
CREATE UNIQUE INDEX idx_assets_serial_unique ON assets(serial) WHERE serial IS NOT NULL AND serial <> '';
CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_assets_hostname ON assets(hostname);

CREATE TABLE movements_state_machine_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  employee_from_id INTEGER,
  employee_to_id INTEGER,
  from_status TEXT,
  to_status TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  reason TEXT,
  technical_report TEXT,
  technician_id INTEGER,
  responsible_technician_id INTEGER,
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(asset_id) REFERENCES assets(id),
  FOREIGN KEY(employee_from_id) REFERENCES employees(id),
  FOREIGN KEY(employee_to_id) REFERENCES employees(id),
  FOREIGN KEY(technician_id) REFERENCES technicians(id),
  FOREIGN KEY(responsible_technician_id) REFERENCES technicians(id)
);

INSERT INTO movements_state_machine_new (
  id, asset_id, employee_from_id, employee_to_id, from_status, to_status,
  movement_type, reason, technician_id, responsible_technician_id, occurred_at, created_at
)
SELECT
  id, asset_id, employee_from_id, employee_to_id,
  CASE
    WHEN from_status IS NULL OR trim(from_status) = '' THEN 'DISPONIVEL'
    ELSE CASE from_status
    WHEN 'assigned' THEN 'EM_USO'
    WHEN 'backup' THEN 'BACKUP'
    WHEN 'maintenance' THEN 'EM_MANUTENCAO'
    WHEN 'retired' THEN 'DESATIVADO'
    ELSE from_status
    END
  END,
  CASE to_status
    WHEN 'assigned' THEN 'EM_USO'
    WHEN 'backup' THEN 'BACKUP'
    WHEN 'maintenance' THEN 'EM_MANUTENCAO'
    WHEN 'retired' THEN 'DESATIVADO'
    ELSE to_status
  END,
  CASE movement_type
    WHEN 'assign' THEN 'ATRIBUICAO'
    WHEN 'return_to_backup' THEN 'DEVOLUCAO'
    WHEN 'retire' THEN 'DESATIVACAO'
    WHEN 'maintenance' THEN 'ENVIO_MANUTENCAO'
    WHEN 'initial_import' THEN CASE to_status
      WHEN 'assigned' THEN 'ATRIBUICAO'
      WHEN 'backup' THEN 'ENVIO_BACKUP'
      WHEN 'maintenance' THEN 'ENVIO_MANUTENCAO'
      WHEN 'retired' THEN 'DESATIVACAO'
      ELSE 'AVALIACAO'
    END
    ELSE upper(movement_type)
  END,
  reason, technician_id, technician_id,
  CASE
    WHEN created_at LIKE '____-__-__ __:__:__' THEN replace(created_at, ' ', 'T') || 'Z'
    ELSE created_at
  END,
  created_at
FROM movements;

DROP TABLE movements;
ALTER TABLE movements_state_machine_new RENAME TO movements;
CREATE INDEX idx_movements_asset ON movements(asset_id, occurred_at DESC);
CREATE INDEX idx_movements_occurred ON movements(occurred_at DESC);

CREATE TRIGGER movements_prevent_update
BEFORE UPDATE ON movements
BEGIN
  SELECT RAISE(ABORT, 'Movimentações são imutáveis.');
END;

CREATE TRIGGER movements_prevent_delete
BEFORE DELETE ON movements
BEGIN
  SELECT RAISE(ABORT, 'Movimentações são imutáveis.');
END;
