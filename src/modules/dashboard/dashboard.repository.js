const { registerScopeFunction, scopeCondition } = require('../../db/scope');

// Ativo: cidade e tipo do ativo; departamento de quem está com ele.
const ASSET_JOINS = `FROM assets a
  LEFT JOIN assignments s ON s.asset_id=a.id AND s.returned_at IS NULL
  LEFT JOIN employees e ON e.id=s.employee_id`;
const ASSET_SCOPE = {
  city: 'a.city',
  equipment_type: 'a.equipment_type',
  department: 'e.department'
};
// Chamado: cidade e departamento de quem abriu; tipo do equipamento do chamado.
const TICKET_JOINS = `FROM tickets t JOIN employees te ON te.id=t.employee_id
  LEFT JOIN assets ta ON ta.id=t.asset_id`;
const TICKET_SCOPE = {
  city: 'te.city',
  department: 'te.department',
  equipment_type: 'ta.equipment_type'
};
const EMPLOYEE_SCOPE = { city: 'city', department: 'department' };

// Todas as consultas recebem o alcance do usuário; o service decide, pelas
// permissões, quais listas com nomes ou chamados entram na resposta.
function createDashboardRepository(db) {
  registerScopeFunction(db);

  function summary(scopes = [], { employees = false } = {}) {
    const asset = scopeCondition(scopes, ASSET_SCOPE);
    const ticket = scopeCondition(scopes, TICKET_SCOPE);
    const person = scopeCondition(scopes, EMPLOYEE_SCOPE);
    const assetCount = (status) =>
      db
        .prepare(`SELECT COUNT(*) c ${ASSET_JOINS} WHERE a.status=? AND ${asset.sql}`)
        .get(status, ...asset.params).c;
    const counts = {
      employees: db
        .prepare(`SELECT COUNT(*) c FROM employees WHERE status='ativo' AND ${person.sql}`)
        .get(...person.params).c,
      assigned: assetCount('EM_USO'),
      backup: assetCount('BACKUP'),
      maintenance: assetCount('EM_MANUTENCAO'),
      retired: assetCount('DESATIVADO'),
      openTickets: db
        .prepare(
          `SELECT COUNT(*) c ${TICKET_JOINS} WHERE t.status IN ('open','in_progress') AND ${ticket.sql}`
        )
        .get(...ticket.params).c
    };
    const recentEmployees = employees
      ? db
          .prepare(
            `SELECT id,name,department,city,created_at FROM employees WHERE ${person.sql}
            ORDER BY created_at DESC LIMIT 6`
          )
          .all(...person.params)
      : [];
    const recentAssets = db
      .prepare(
        `SELECT a.id,a.equipment_type,a.hostname,a.serial,a.status,a.created_at ${ASSET_JOINS}
        WHERE ${asset.sql} ORDER BY a.created_at DESC LIMIT 6`
      )
      .all(...asset.params);
    const from = scopeCondition(scopes, { city: 'ef.city', department: 'ef.department' });
    const to = scopeCondition(scopes, { city: 'et.city', department: 'et.department' });
    const recentMovements = db
      .prepare(
        `SELECT m.*,a.hostname,a.serial,a.equipment_type,u.name responsible_user,
        CASE WHEN ${employees ? from.sql : '0'} THEN ef.name END employee_from,
        CASE WHEN ${employees ? to.sql : '0'} THEN et.name END employee_to
        FROM movements m JOIN assets a ON a.id=m.asset_id
        LEFT JOIN assignments s ON s.asset_id=a.id AND s.returned_at IS NULL
        LEFT JOIN employees e ON e.id=s.employee_id
        LEFT JOIN users u ON u.id=m.responsible_user_id
        LEFT JOIN employees ef ON ef.id=m.employee_from_id
        LEFT JOIN employees et ON et.id=m.employee_to_id
        WHERE ${asset.sql} ORDER BY m.created_at DESC LIMIT 10`
      )
      .all(...(employees ? from.params : []), ...(employees ? to.params : []), ...asset.params);
    return { counts, recentEmployees, recentAssets, recentMovements };
  }

  function report(filters, scopes = [], { employees = false, tickets = false } = {}) {
    const { year, month, ticketStatus, ticketType, assetStatus, assetType } = filters;
    const ticketScope = scopeCondition(scopes, TICKET_SCOPE);
    const ticketConditions = [ticketScope.sql];
    const ticketParams = [...ticketScope.params];
    if (year) {
      ticketConditions.push("strftime('%Y',t.opened_at)=?");
      ticketParams.push(year);
    }
    if (month) {
      ticketConditions.push("strftime('%m',t.opened_at)=?");
      ticketParams.push(month.padStart(2, '0'));
    }
    if (ticketStatus) {
      ticketConditions.push('t.status=?');
      ticketParams.push(ticketStatus);
    }
    if (ticketType) {
      ticketConditions.push("COALESCE(NULLIF(TRIM(t.type),''),'Sem categoria')=?");
      ticketParams.push(ticketType);
    }
    const ticketWhere = ticketConditions.join(' AND ');

    const assetScope = scopeCondition(scopes, ASSET_SCOPE);
    const assetConditions = [assetScope.sql];
    const assetParams = [...assetScope.params];
    if (assetStatus) {
      assetConditions.push('a.status=?');
      assetParams.push(assetStatus);
    }
    if (assetType) {
      assetConditions.push('a.equipment_type=?');
      assetParams.push(assetType);
    }
    const assetWhere = assetConditions.join(' AND ');
    const person = scopeCondition(scopes, EMPLOYEE_SCOPE);
    const holder = scopeCondition(scopes, { city: 'e.city', department: 'e.department' });
    const employeeName = (column, condition) =>
      employees ? `CASE WHEN ${condition.sql} THEN ${column} END` : 'NULL';
    const nameParams = (condition) => (employees ? condition.params : []);

    const recentTickets = (where, params, limit) =>
      tickets
        ? db
            .prepare(
              `SELECT t.id,t.ticket_number,t.type,t.status,t.opened_at,
              ${employees ? 'te.name' : 'NULL'} employee_name
              ${TICKET_JOINS} WHERE ${where} ORDER BY t.opened_at DESC,t.id DESC LIMIT ${limit}`
            )
            .all(...params)
        : [];

    const scopedTickets = scopeCondition(scopes, TICKET_SCOPE);
    const summary = {
      employeesActive: db
        .prepare(`SELECT COUNT(*) n FROM employees WHERE status='ativo' AND ${person.sql}`)
        .get(...person.params).n,
      assetsManaged: db
        .prepare(
          `SELECT COUNT(*) n ${ASSET_JOINS} WHERE a.status<>'DESATIVADO' AND ${assetScope.sql}`
        )
        .get(...assetScope.params).n,
      techniciansActive: db
        .prepare("SELECT COUNT(*) n FROM users WHERE active=1 AND profile_base='TECNICO'")
        .get().n,
      ticketsTotal: db
        .prepare(`SELECT COUNT(*) n ${TICKET_JOINS} WHERE ${scopedTickets.sql}`)
        .get(...scopedTickets.params).n,
      ticketsOpen: db
        .prepare(
          `SELECT COUNT(*) n ${TICKET_JOINS} WHERE t.status IN ('open','in_progress') AND ${scopedTickets.sql}`
        )
        .get(...scopedTickets.params).n,
      assetStatus: db
        .prepare(
          `SELECT a.status label,COUNT(*) n ${ASSET_JOINS} WHERE ${assetScope.sql} GROUP BY a.status ORDER BY n DESC`
        )
        .all(...assetScope.params),
      ticketStatus: db
        .prepare(
          `SELECT t.status label,COUNT(*) n ${TICKET_JOINS} WHERE ${scopedTickets.sql} GROUP BY t.status ORDER BY n DESC`
        )
        .all(...scopedTickets.params),
      ticketAnnual: db
        .prepare(
          `SELECT strftime('%Y',t.opened_at) label,COUNT(*) n ${TICKET_JOINS}
          WHERE strftime('%Y',t.opened_at) IS NOT NULL AND ${scopedTickets.sql} GROUP BY label ORDER BY label`
        )
        .all(...scopedTickets.params),
      recentTickets: recentTickets(scopedTickets.sql, scopedTickets.params, 5)
    };
    const assets = {
      total: db.prepare(`SELECT COUNT(*) n ${ASSET_JOINS} WHERE ${assetWhere}`).get(...assetParams)
        .n,
      byStatus: db
        .prepare(
          `SELECT a.status label,COUNT(*) n ${ASSET_JOINS} WHERE ${assetWhere} GROUP BY a.status ORDER BY n DESC`
        )
        .all(...assetParams),
      byType: db
        .prepare(
          `SELECT a.equipment_type label,COUNT(*) n ${ASSET_JOINS} WHERE ${assetWhere} GROUP BY a.equipment_type ORDER BY n DESC LIMIT 8`
        )
        .all(...assetParams),
      recent: db
        .prepare(
          `SELECT a.id,a.hostname,a.equipment_type,a.model,a.serial,a.reference,a.status,
          ${employeeName('e.name', holder)} employee_name
          ${ASSET_JOINS} WHERE ${assetWhere}
          ORDER BY a.updated_at DESC,a.id DESC LIMIT 8`
        )
        .all(...nameParams(holder), ...assetParams),
      types: db
        .prepare(
          `SELECT DISTINCT a.equipment_type ${ASSET_JOINS} WHERE ${assetScope.sql} ORDER BY a.equipment_type`
        )
        .all(...assetScope.params)
        .map((row) => row.equipment_type)
    };
    const ticketsReport = {
      total: db
        .prepare(`SELECT COUNT(*) n ${TICKET_JOINS} WHERE ${ticketWhere}`)
        .get(...ticketParams).n,
      resolved: db
        .prepare(`SELECT COUNT(*) n ${TICKET_JOINS} WHERE ${ticketWhere} AND t.status='closed'`)
        .get(...ticketParams).n,
      pending: db
        .prepare(
          `SELECT COUNT(*) n ${TICKET_JOINS} WHERE ${ticketWhere} AND t.status IN ('open','in_progress')`
        )
        .get(...ticketParams).n,
      requesters: db
        .prepare(`SELECT COUNT(DISTINCT t.employee_id) n ${TICKET_JOINS} WHERE ${ticketWhere}`)
        .get(...ticketParams).n,
      byStatus: db
        .prepare(
          `SELECT t.status label,COUNT(*) n ${TICKET_JOINS} WHERE ${ticketWhere} GROUP BY t.status ORDER BY n DESC`
        )
        .all(...ticketParams),
      byType: db
        .prepare(
          `SELECT COALESCE(NULLIF(TRIM(t.type),''),'Sem categoria') label,COUNT(*) n ${TICKET_JOINS} WHERE ${ticketWhere} GROUP BY label ORDER BY n DESC LIMIT 10`
        )
        .all(...ticketParams),
      monthly: db
        .prepare(
          `SELECT substr(t.opened_at,1,7) label,COUNT(*) n ${TICKET_JOINS} WHERE ${ticketWhere} GROUP BY label ORDER BY label`
        )
        .all(...ticketParams),
      recent: recentTickets(ticketWhere, ticketParams, 8),
      years: db
        .prepare(
          `SELECT DISTINCT strftime('%Y',t.opened_at) year ${TICKET_JOINS}
          WHERE strftime('%Y',t.opened_at) IS NOT NULL AND ${scopedTickets.sql} ORDER BY year DESC`
        )
        .all(...scopedTickets.params)
        .map((row) => row.year),
      types: db
        .prepare(
          `SELECT DISTINCT COALESCE(NULLIF(TRIM(t.type),''),'Sem categoria') type ${TICKET_JOINS}
          WHERE ${scopedTickets.sql} ORDER BY type`
        )
        .all(...scopedTickets.params)
        .map((row) => row.type)
    };
    return { summary, assets, tickets: ticketsReport };
  }

  return { summary, report };
}

module.exports = { createDashboardRepository };
