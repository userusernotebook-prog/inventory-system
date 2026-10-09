-- SQLite's CURRENT_TIMESTAMP is UTC but emits "YYYY-MM-DD HH:MM:SS". Normalize
-- legacy timestamp values to a parseable ISO-8601 UTC representation. Calendar
-- fields (hire_date and offboarded_at) intentionally remain YYYY-MM-DD.
DROP TRIGGER IF EXISTS movements_prevent_update;
DROP TRIGGER IF EXISTS movements_prevent_delete;
DROP TRIGGER IF EXISTS approval_events_prevent_update;
DROP TRIGGER IF EXISTS approval_events_prevent_delete;
DROP TRIGGER IF EXISTS employee_events_prevent_update;
DROP TRIGGER IF EXISTS employee_events_prevent_delete;

UPDATE schema_migrations SET applied_at=strftime('%Y-%m-%dT%H:%M:%fZ',applied_at)
WHERE length(applied_at)>10 AND instr(applied_at,'Z')=0;

UPDATE employees SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ',created_at),
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ',updated_at),
  offboarding_started_at=CASE WHEN offboarding_started_at IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ',offboarding_started_at) END
WHERE (length(created_at)>10 AND instr(created_at,'Z')=0)
   OR (length(updated_at)>10 AND instr(updated_at,'Z')=0)
   OR (offboarding_started_at IS NOT NULL AND length(offboarding_started_at)>10 AND instr(offboarding_started_at,'Z')=0);
UPDATE assets SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ',created_at),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ',updated_at)
WHERE (length(created_at)>10 AND instr(created_at,'Z')=0) OR (length(updated_at)>10 AND instr(updated_at,'Z')=0);
UPDATE assignments SET assigned_at=strftime('%Y-%m-%dT%H:%M:%fZ',assigned_at),
  returned_at=CASE WHEN returned_at IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ',returned_at) END
WHERE (length(assigned_at)>10 AND instr(assigned_at,'Z')=0) OR (returned_at IS NOT NULL AND length(returned_at)>10 AND instr(returned_at,'Z')=0);
UPDATE movements SET occurred_at=strftime('%Y-%m-%dT%H:%M:%fZ',occurred_at),created_at=strftime('%Y-%m-%dT%H:%M:%fZ',created_at)
WHERE (length(occurred_at)>10 AND instr(occurred_at,'Z')=0) OR (length(created_at)>10 AND instr(created_at,'Z')=0);
UPDATE tickets SET opened_at=strftime('%Y-%m-%dT%H:%M:%fZ',opened_at),
  closed_at=CASE WHEN closed_at IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ',closed_at) END,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ',updated_at)
WHERE (length(opened_at)>10 AND instr(opened_at,'Z')=0) OR (closed_at IS NOT NULL AND length(closed_at)>10 AND instr(closed_at,'Z')=0) OR (length(updated_at)>10 AND instr(updated_at,'Z')=0);
UPDATE audit_log SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ',created_at) WHERE length(created_at)>10 AND instr(created_at,'Z')=0;
UPDATE users SET last_login_at=CASE WHEN last_login_at IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ',last_login_at) END,
  locked_until=CASE WHEN locked_until IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ',locked_until) END,
  created_at=strftime('%Y-%m-%dT%H:%M:%fZ',created_at),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ',updated_at)
WHERE (last_login_at IS NOT NULL AND length(last_login_at)>10 AND instr(last_login_at,'Z')=0) OR (locked_until IS NOT NULL AND length(locked_until)>10 AND instr(locked_until,'Z')=0) OR (length(created_at)>10 AND instr(created_at,'Z')=0) OR (length(updated_at)>10 AND instr(updated_at,'Z')=0);
UPDATE sessions SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ',expires_at),
  revoked_at=CASE WHEN revoked_at IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ',revoked_at) END,
  created_at=strftime('%Y-%m-%dT%H:%M:%fZ',created_at),last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ',last_seen_at)
WHERE (length(expires_at)>10 AND instr(expires_at,'Z')=0) OR (revoked_at IS NOT NULL AND length(revoked_at)>10 AND instr(revoked_at,'Z')=0) OR (length(created_at)>10 AND instr(created_at,'Z')=0) OR (length(last_seen_at)>10 AND instr(last_seen_at,'Z')=0);
UPDATE approval_requests SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ',created_at),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ',updated_at),
  expires_at=strftime('%Y-%m-%dT%H:%M:%fZ',expires_at),decided_at=CASE WHEN decided_at IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ',decided_at) END,
  executed_at=CASE WHEN executed_at IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ',executed_at) END
WHERE 1=1;
UPDATE approval_asset_reservations SET reserved_at=strftime('%Y-%m-%dT%H:%M:%fZ',reserved_at) WHERE length(reserved_at)>10 AND instr(reserved_at,'Z')=0;
UPDATE approval_request_events SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ',created_at) WHERE length(created_at)>10 AND instr(created_at,'Z')=0;
UPDATE user_notifications SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ',created_at),read_at=CASE WHEN read_at IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ',read_at) END WHERE 1=1;
UPDATE employee_events SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ',created_at) WHERE length(created_at)>10 AND instr(created_at,'Z')=0;
UPDATE asset_receipts SET received_at=strftime('%Y-%m-%dT%H:%M:%fZ',received_at),created_at=strftime('%Y-%m-%dT%H:%M:%fZ',created_at) WHERE 1=1;

-- Preserve existing records if an old import contains duplicate employee codes.
UPDATE employees SET code=trim(code) WHERE code IS NOT NULL;
UPDATE employees SET code=code || '-' || id
WHERE id IN (
  SELECT newer.id FROM employees newer
  JOIN employees older ON lower(older.code)=lower(newer.code) AND older.id<newer.id
  WHERE newer.code IS NOT NULL AND newer.code<>''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_code_unique_nocase
ON employees(code COLLATE NOCASE) WHERE code IS NOT NULL AND code<>'';

CREATE TRIGGER movements_prevent_update BEFORE UPDATE ON movements BEGIN SELECT RAISE(ABORT,'Movimentações são imutáveis.'); END;
CREATE TRIGGER movements_prevent_delete BEFORE DELETE ON movements BEGIN SELECT RAISE(ABORT,'Movimentações são imutáveis.'); END;
CREATE TRIGGER approval_events_prevent_update BEFORE UPDATE ON approval_request_events BEGIN SELECT RAISE(ABORT,'Eventos de aprovação são imutáveis.'); END;
CREATE TRIGGER approval_events_prevent_delete BEFORE DELETE ON approval_request_events BEGIN SELECT RAISE(ABORT,'Eventos de aprovação são imutáveis.'); END;
CREATE TRIGGER employee_events_prevent_update BEFORE UPDATE ON employee_events BEGIN SELECT RAISE(ABORT,'Eventos de funcionário são imutáveis.'); END;
CREATE TRIGGER employee_events_prevent_delete BEFORE DELETE ON employee_events BEGIN SELECT RAISE(ABORT,'Eventos de funcionário são imutáveis.'); END;
