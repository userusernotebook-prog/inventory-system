-- Regra R1: DISPONIVEL e somente estoque novo, nunca usado. Pela regra antiga,
-- equipamentos devolvidos, avaliados ou reparados podiam voltar a DISPONIVEL e
-- depois ser atribuidos sem aprovacao. Eles passam para BACKUP, e a mudanca fica
-- registrada como movimentacao.
CREATE TEMP TABLE r1_used_available AS
SELECT a.id FROM assets a
WHERE a.status='DISPONIVEL'
  AND (
    EXISTS (SELECT 1 FROM assignments s WHERE s.asset_id=a.id)
    OR EXISTS (SELECT 1 FROM movements m WHERE m.asset_id=a.id AND m.to_status<>'DISPONIVEL')
  );

INSERT INTO movements(asset_id,from_status,to_status,movement_type,reason,occurred_at,created_at)
SELECT id,'DISPONIVEL','BACKUP','ENVIO_BACKUP',
  'Regra R1: equipamento ja usado volta para BACKUP (migration 013).',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM r1_used_available;

UPDATE assets SET status='BACKUP',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id IN (SELECT id FROM r1_used_available);

DROP TABLE r1_used_available;
