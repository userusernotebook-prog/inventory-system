const { registerScopeFunction, scopeCondition } = require('../../db/scope');

function createMovementsRepository(db) {
  registerScopeFunction(db);
  return {
    create(input) {
      return db
        .prepare(
          `INSERT INTO movements
        (asset_id,employee_from_id,employee_to_id,from_status,to_status,
        movement_type,reason,technical_report,responsible_user_id,occurred_at,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          input.assetId,
          input.fromEmployeeId,
          input.toEmployeeId,
          input.fromStatus,
          input.toStatus,
          input.type,
          input.reason,
          input.technicalReport,
          input.responsibleUserId,
          input.occurredAt,
          new Date().toISOString()
        ).lastInsertRowid;
    },
    // Reserva vigente: solicitação ainda PENDENTE e dentro do prazo.
    activeReservation(assetId) {
      return db
        .prepare(
          `SELECT r.request_id FROM approval_asset_reservations r
          JOIN approval_requests q ON q.id=r.request_id
          WHERE r.asset_id=? AND q.status='PENDENTE' AND q.expires_at>?`
        )
        .get(assetId, new Date().toISOString());
    },
    // Nomes de quem entregou/recebeu só vêm quando a pessoa está no alcance.
    listAssetHistory(assetId, scopes = []) {
      const from = scopeCondition(scopes, { city: 'ef.city', department: 'ef.department' });
      const to = scopeCondition(scopes, { city: 'et.city', department: 'et.department' });
      return db
        .prepare(
          `SELECT m.*,COALESCE(m.occurred_at,m.created_at) occurred_at,
          u.name responsible_user,
          CASE WHEN ${from.sql} THEN ef.name END employee_from,
          CASE WHEN ${to.sql} THEN et.name END employee_to
          FROM movements m LEFT JOIN users u ON u.id=m.responsible_user_id
          LEFT JOIN employees ef ON ef.id=m.employee_from_id
          LEFT JOIN employees et ON et.id=m.employee_to_id
          WHERE asset_id=? ORDER BY occurred_at DESC`
        )
        .all(...from.params, ...to.params, assetId);
    }
  };
}

module.exports = { createMovementsRepository };
