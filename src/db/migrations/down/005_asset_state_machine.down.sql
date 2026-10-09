DROP TRIGGER IF EXISTS movements_prevent_update;
DROP TRIGGER IF EXISTS movements_prevent_delete;

CREATE TABLE IF NOT EXISTS asset_state_machine_005_rollback_states (
  asset_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DELETE FROM asset_state_machine_005_rollback_states;
INSERT INTO asset_state_machine_005_rollback_states(asset_id,status)
SELECT id,status FROM assets;

UPDATE movements
SET from_status = CASE from_status
  WHEN 'EM_USO' THEN 'assigned'
  WHEN 'BACKUP' THEN 'backup'
  WHEN 'EM_MANUTENCAO' THEN 'maintenance'
  WHEN 'DESATIVADO' THEN 'retired'
  ELSE from_status
END,
to_status = CASE to_status
  WHEN 'EM_USO' THEN 'assigned'
  WHEN 'BACKUP' THEN 'backup'
  WHEN 'EM_MANUTENCAO' THEN 'maintenance'
  WHEN 'DESATIVADO' THEN 'retired'
  ELSE to_status
END;

CREATE TABLE assets_before_state_machine (
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
  status TEXT NOT NULL DEFAULT 'backup' CHECK(status IN ('assigned', 'backup', 'maintenance', 'retired')),
  retirement_reason TEXT,
  activated_at TEXT,
  replaced_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO assets_before_state_machine
SELECT
  id, hostname, equipment_type, manufacturer, model, serial, description, imei1,
  imei2, apple_id, reference, condition_text, city, location,
  CASE status
    WHEN 'EM_USO' THEN 'assigned'
    WHEN 'BACKUP' THEN 'backup'
    WHEN 'EM_MANUTENCAO' THEN 'maintenance'
    WHEN 'DESATIVADO' THEN 'retired'
    ELSE 'backup'
  END,
  retirement_reason, activated_at, replaced_at, created_at, updated_at
FROM assets;

DROP TABLE assets;
ALTER TABLE assets_before_state_machine RENAME TO assets;
CREATE UNIQUE INDEX idx_assets_serial_unique ON assets(serial) WHERE serial IS NOT NULL AND serial <> '';
CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_assets_hostname ON assets(hostname);
