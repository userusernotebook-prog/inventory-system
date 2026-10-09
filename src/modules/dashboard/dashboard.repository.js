function createDashboardRepository(db) {
  function summary() {
    const counts = {
      employees: db.prepare("SELECT COUNT(*) c FROM employees WHERE status='active'").get().c,
      assigned: db.prepare("SELECT COUNT(*) c FROM assets WHERE status='EM_USO'").get().c,
      backup: db.prepare("SELECT COUNT(*) c FROM assets WHERE status='BACKUP'").get().c,
      maintenance: db.prepare("SELECT COUNT(*) c FROM assets WHERE status='EM_MANUTENCAO'").get().c,
      retired: db.prepare("SELECT COUNT(*) c FROM assets WHERE status='DESATIVADO'").get().c,
      openTickets: db
        .prepare("SELECT COUNT(*) c FROM tickets WHERE status IN ('open','in_progress')")
        .get().c
    };
    const recentEmployees = db
      .prepare(
        'SELECT id,name,department,city,created_at FROM employees ORDER BY created_at DESC LIMIT 6'
      )
      .all();
    const recentAssets = db
      .prepare(
        'SELECT id,equipment_type,hostname,serial,status,created_at FROM assets ORDER BY created_at DESC LIMIT 6'
      )
      .all();
    const recentMovements = db
      .prepare(
        `SELECT m.*,a.hostname,a.serial,a.equipment_type,u.name responsible_user,
    ef.name employee_from,et.name employee_to FROM movements m JOIN assets a ON a.id=m.asset_id
    LEFT JOIN users u ON u.id=m.responsible_user_id LEFT JOIN employees ef ON ef.id=m.employee_from_id
    LEFT JOIN employees et ON et.id=m.employee_to_id ORDER BY m.created_at DESC LIMIT 10`
      )
      .all();
    return { counts, recentEmployees, recentAssets, recentMovements };
  }

  function report(filters) {
    const { year, month, ticketStatus, ticketType, assetStatus, assetType } = filters;
    const ticketConditions = ['1=1'],
      ticketParams = [];
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

    const assetConditions = ['1=1'],
      assetParams = [];
    if (assetStatus) {
      assetConditions.push('a.status=?');
      assetParams.push(assetStatus);
    }
    if (assetType) {
      assetConditions.push('a.equipment_type=?');
      assetParams.push(assetType);
    }
    const assetWhere = assetConditions.join(' AND ');

    const summary = {
      employeesActive: db.prepare("SELECT COUNT(*) n FROM employees WHERE status='active'").get().n,
      assetsManaged: db.prepare("SELECT COUNT(*) n FROM assets WHERE status<>'DESATIVADO'").get().n,
      techniciansActive: db
        .prepare("SELECT COUNT(*) n FROM users WHERE active=1 AND profile_base='TECNICO'")
        .get().n,
      ticketsTotal: db.prepare('SELECT COUNT(*) n FROM tickets').get().n,
      ticketsOpen: db
        .prepare("SELECT COUNT(*) n FROM tickets WHERE status IN ('open','in_progress')")
        .get().n,
      assetStatus: db
        .prepare('SELECT status label,COUNT(*) n FROM assets GROUP BY status ORDER BY n DESC')
        .all(),
      ticketStatus: db
        .prepare('SELECT status label,COUNT(*) n FROM tickets GROUP BY status ORDER BY n DESC')
        .all(),
      ticketAnnual: db
        .prepare(
          "SELECT strftime('%Y',opened_at) label,COUNT(*) n FROM tickets WHERE strftime('%Y',opened_at) IS NOT NULL GROUP BY label ORDER BY label"
        )
        .all(),
      recentTickets: db
        .prepare(
          `SELECT t.id,t.ticket_number,t.type,t.status,t.opened_at,e.name employee_name
      FROM tickets t JOIN employees e ON e.id=t.employee_id ORDER BY t.opened_at DESC,t.id DESC LIMIT 5`
        )
        .all()
    };
    const assets = {
      total: db.prepare(`SELECT COUNT(*) n FROM assets a WHERE ${assetWhere}`).get(...assetParams)
        .n,
      byStatus: db
        .prepare(
          `SELECT a.status label,COUNT(*) n FROM assets a WHERE ${assetWhere} GROUP BY a.status ORDER BY n DESC`
        )
        .all(...assetParams),
      byType: db
        .prepare(
          `SELECT a.equipment_type label,COUNT(*) n FROM assets a WHERE ${assetWhere} GROUP BY a.equipment_type ORDER BY n DESC LIMIT 8`
        )
        .all(...assetParams),
      recent: db
        .prepare(
          `SELECT a.id,a.hostname,a.equipment_type,a.model,a.serial,a.reference,a.status,e.name employee_name
      FROM assets a LEFT JOIN assignments s ON s.asset_id=a.id AND s.returned_at IS NULL
      LEFT JOIN employees e ON e.id=s.employee_id WHERE ${assetWhere}
      ORDER BY a.updated_at DESC,a.id DESC LIMIT 8`
        )
        .all(...assetParams),
      types: db
        .prepare('SELECT DISTINCT equipment_type FROM assets ORDER BY equipment_type')
        .all()
        .map((row) => row.equipment_type)
    };
    const tickets = {
      total: db
        .prepare(`SELECT COUNT(*) n FROM tickets t WHERE ${ticketWhere}`)
        .get(...ticketParams).n,
      resolved: db
        .prepare(`SELECT COUNT(*) n FROM tickets t WHERE ${ticketWhere} AND t.status='closed'`)
        .get(...ticketParams).n,
      pending: db
        .prepare(
          `SELECT COUNT(*) n FROM tickets t WHERE ${ticketWhere} AND t.status IN ('open','in_progress')`
        )
        .get(...ticketParams).n,
      requesters: db
        .prepare(`SELECT COUNT(DISTINCT t.employee_id) n FROM tickets t WHERE ${ticketWhere}`)
        .get(...ticketParams).n,
      byStatus: db
        .prepare(
          `SELECT t.status label,COUNT(*) n FROM tickets t WHERE ${ticketWhere} GROUP BY t.status ORDER BY n DESC`
        )
        .all(...ticketParams),
      byType: db
        .prepare(
          `SELECT COALESCE(NULLIF(TRIM(t.type),''),'Sem categoria') label,COUNT(*) n FROM tickets t WHERE ${ticketWhere} GROUP BY label ORDER BY n DESC LIMIT 10`
        )
        .all(...ticketParams),
      monthly: db
        .prepare(
          `SELECT substr(t.opened_at,1,7) label,COUNT(*) n FROM tickets t WHERE ${ticketWhere} GROUP BY label ORDER BY label`
        )
        .all(...ticketParams),
      recent: db
        .prepare(
          `SELECT t.id,t.ticket_number,t.type,t.status,t.opened_at,e.name employee_name
      FROM tickets t JOIN employees e ON e.id=t.employee_id WHERE ${ticketWhere}
      ORDER BY t.opened_at DESC,t.id DESC LIMIT 8`
        )
        .all(...ticketParams),
      years: db
        .prepare(
          "SELECT DISTINCT strftime('%Y',opened_at) year FROM tickets WHERE strftime('%Y',opened_at) IS NOT NULL ORDER BY year DESC"
        )
        .all()
        .map((row) => row.year),
      types: db
        .prepare(
          "SELECT DISTINCT COALESCE(NULLIF(TRIM(type),''),'Sem categoria') type FROM tickets ORDER BY type"
        )
        .all()
        .map((row) => row.type)
    };
    return { summary, assets, tickets };
  }

  return { summary, report };
}

module.exports = { createDashboardRepository };
