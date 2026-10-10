ALTER TABLE assets ADD COLUMN acquisition_value REAL;

INSERT OR IGNORE INTO role_permissions(profile_base, permission)
VALUES ('TECNICO', 'asset:assign');
