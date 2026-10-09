const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { adminPassword: ADMIN_PASSWORD, port: PORT } = require('./config');
const { readWorkbook, readRows } = require('./workbook-reader');
const db = require('./db');
const importTemplate = require('./import-template');

const app = express();
const upload = multer({
  dest: path.join(__dirname, 'data', 'uploads'),
  limits: { fileSize: 15 * 1024 * 1024 }
});
const adminTokens = new Map();

app.use(express.json({ limit: '1mb' }));
app.get('/api/templates/initial', (req, res) => {
  res.download('modelo-importacao-inicial.xlsx', 'modelo-importacao-inicial.xlsx', {
    root: path.join(__dirname, 'public')
  });
});
app.use(express.static(path.join(__dirname, 'public')));

function tech(req) {
  const id = Number(req.header('x-technician-id'));
  if (!id) return null;
  return db.prepare('SELECT * FROM technicians WHERE id=? AND active=1').get(id);
}
function requireTech(req, res, next) {
  const t = tech(req);
  if (!t) return res.status(400).json({ error: 'Selecione o técnico responsável.' });
  req.tech = t;
  next();
}
function admin(req, res, next) {
  const token = (req.header('authorization') || '').replace(/^Bearer\s+/, '');
  const exp = adminTokens.get(token);
  if (!exp || exp < Date.now())
    return res.status(401).json({ error: 'Acesso de administrador necessário.' });
  next();
}
function log(actor, action, entityType, entityId, details) {
  db.prepare(
    'INSERT INTO audit_log(actor,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)'
  ).run(actor, action, entityType, entityId, JSON.stringify(details || {}));
}
function text(v) {
  return v == null ? null : String(v).trim() || null;
}
function optionalDate(value, field) {
  const date = text(value);
  if (!date) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  ) {
    throw new Error(`${field} deve ser uma data válida.`);
  }
  return date;
}
function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

app.get('/api/technicians', (req, res) =>
  res.json(db.prepare('SELECT id,name,role FROM technicians WHERE active=1 ORDER BY name').all())
);
app.post('/api/admin/login', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Senha inválida.' });
  const token = crypto.randomBytes(24).toString('hex');
  adminTokens.set(token, Date.now() + 8 * 60 * 60 * 1000);
  res.json({ token });
});

app.get('/api/dashboard', (req, res) => {
  const counts = {
    employees: db.prepare("SELECT COUNT(*) c FROM employees WHERE status='active'").get().c,
    assigned: db.prepare("SELECT COUNT(*) c FROM assets WHERE status='assigned'").get().c,
    backup: db.prepare("SELECT COUNT(*) c FROM assets WHERE status='backup'").get().c,
    maintenance: db.prepare("SELECT COUNT(*) c FROM assets WHERE status='maintenance'").get().c,
    retired: db.prepare("SELECT COUNT(*) c FROM assets WHERE status='retired'").get().c,
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
      `SELECT m.*,a.hostname,a.serial,a.equipment_type,t.name technician,
    ef.name employee_from,et.name employee_to FROM movements m JOIN assets a ON a.id=m.asset_id
    LEFT JOIN technicians t ON t.id=m.technician_id LEFT JOIN employees ef ON ef.id=m.employee_from_id
    LEFT JOIN employees et ON et.id=m.employee_to_id ORDER BY m.created_at DESC LIMIT 10`
    )
    .all();
  res.json({ counts, recentEmployees, recentAssets, recentMovements });
});

app.get('/api/dashboard/report', (req, res) => {
  const year = text(req.query.year),
    month = text(req.query.month);
  const ticketStatus = text(req.query.ticketStatus),
    ticketType = text(req.query.ticketType);
  const assetStatus = text(req.query.assetStatus),
    assetType = text(req.query.assetType);
  if (year && !/^\d{4}$/.test(year)) return res.status(400).json({ error: 'Ano inválido.' });
  if (month && !/^(0?[1-9]|1[0-2])$/.test(month))
    return res.status(400).json({ error: 'Mês inválido.' });
  if (ticketStatus && !['open', 'in_progress', 'closed', 'cancelled'].includes(ticketStatus))
    return res.status(400).json({ error: 'Status de chamado inválido.' });
  if (assetStatus && !['assigned', 'backup', 'maintenance', 'retired'].includes(assetStatus))
    return res.status(400).json({ error: 'Status de ativo inválido.' });

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
    assetsManaged: db.prepare("SELECT COUNT(*) n FROM assets WHERE status<>'retired'").get().n,
    techniciansActive: db
      .prepare("SELECT COUNT(*) n FROM technicians WHERE active=1 AND role='technician'")
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
    total: db.prepare(`SELECT COUNT(*) n FROM assets a WHERE ${assetWhere}`).get(...assetParams).n,
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
    total: db.prepare(`SELECT COUNT(*) n FROM tickets t WHERE ${ticketWhere}`).get(...ticketParams)
      .n,
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
  res.json({ summary, assets, tickets });
});

app.get('/api/employees', (req, res) => {
  const q = text(req.query.q);
  if (q)
    res.json(
      db
        .prepare(
          'SELECT * FROM employees WHERE name LIKE ? OR email LIKE ? OR department LIKE ? ORDER BY name LIMIT 100'
        )
        .all(`%${q}%`, `%${q}%`, `%${q}%`)
    );
  else res.json(db.prepare('SELECT * FROM employees ORDER BY created_at DESC LIMIT 300').all());
});
app.get('/api/employees/:id', (req, res) => {
  const employee = db.prepare('SELECT * FROM employees WHERE id=?').get(req.params.id);
  if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado.' });
  res.json(employee);
});
app.post('/api/employees', requireTech, (req, res) => {
  const b = req.body;
  if (!text(b.name)) return res.status(400).json({ error: 'Nome é obrigatório.' });
  const r = db
    .prepare(
      `INSERT INTO employees(code,name,email,city,department,location,corporate_phone,personal_phone,status) VALUES(?,?,?,?,?,?,?,?,?)`
    )
    .run(
      text(b.code),
      text(b.name),
      text(b.email),
      text(b.city),
      text(b.department),
      text(b.location),
      text(b.corporate_phone),
      text(b.personal_phone),
      b.status === 'inactive' ? 'inactive' : 'active'
    );
  log(req.tech.name, 'create', 'employee', r.lastInsertRowid, b);
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/employees/:id', admin, (req, res) => {
  const current = db.prepare('SELECT * FROM employees WHERE id=?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Funcionário não encontrado.' });
  const b = req.body || {};
  if (b.status !== undefined && b.status !== current.status)
    return res.status(400).json({ error: 'Altere o status pelo fluxo de desligamento.' });
  const fields = [
    'code',
    'name',
    'email',
    'department',
    'cost_center',
    'city',
    'location',
    'corporate_phone',
    'personal_phone'
  ];
  const updated = {};
  for (const field of fields)
    updated[field] = Object.hasOwn(b, field) ? text(b[field]) : current[field];
  if (!updated.name) return res.status(400).json({ error: 'Nome é obrigatório.' });
  try {
    updated.hire_date = Object.hasOwn(b, 'hire_date')
      ? optionalDate(b.hire_date, 'Data de admissão')
      : current.hire_date;
    updated.offboarded_at = Object.hasOwn(b, 'offboarded_at')
      ? optionalDate(b.offboarded_at, 'Data de desligamento')
      : current.offboarded_at;
    if (current.status === 'active' && updated.offboarded_at)
      return res
        .status(400)
        .json({ error: 'A data de desligamento só pode ser preenchida após o desligamento.' });
    if (current.offboarded_at && updated.offboarded_at === current.offboarded_at.slice(0, 10))
      updated.offboarded_at = current.offboarded_at;
    const duplicate =
      updated.code &&
      db
        .prepare('SELECT id FROM employees WHERE code=? COLLATE NOCASE AND id<>?')
        .get(updated.code, current.id);
    if (duplicate)
      return res.status(400).json({ error: 'Já existe um funcionário com esse código.' });
    db.transaction(() => {
      db.prepare(
        `UPDATE employees SET code=@code,name=@name,email=@email,department=@department,cost_center=@cost_center,city=@city,location=@location,corporate_phone=@corporate_phone,personal_phone=@personal_phone,hire_date=@hire_date,offboarded_at=@offboarded_at,updated_at=CURRENT_TIMESTAMP WHERE id=@id`
      ).run({ ...updated, id: current.id });
      log('Administrador', 'update', 'employee', current.id, updated);
    })();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/assets', (req, res) => {
  const q = text(req.query.q),
    status = text(req.query.status);
  let sql = `SELECT a.*,e.id employee_id,e.name employee_name FROM assets a LEFT JOIN assignments s ON s.asset_id=a.id AND s.returned_at IS NULL LEFT JOIN employees e ON e.id=s.employee_id WHERE 1=1`;
  const p = [];
  if (q) {
    sql += ` AND (a.serial LIKE ? OR a.hostname LIKE ? OR a.model LIKE ? OR a.reference LIKE ? OR e.name LIKE ?)`;
    for (let i = 0; i < 5; i++) p.push(`%${q}%`);
  }
  if (status) {
    sql += ' AND a.status=?';
    p.push(status);
  }
  sql += ' ORDER BY a.updated_at DESC LIMIT 500';
  res.json(db.prepare(sql).all(...p));
});
app.get('/api/assets/:id/history', (req, res) =>
  res.json(
    db
      .prepare(
        `SELECT m.*,t.name technician,ef.name employee_from,et.name employee_to FROM movements m LEFT JOIN technicians t ON t.id=m.technician_id LEFT JOIN employees ef ON ef.id=m.employee_from_id LEFT JOIN employees et ON et.id=m.employee_to_id WHERE asset_id=? ORDER BY created_at DESC`
      )
      .all(req.params.id)
  )
);
app.post('/api/assets', requireTech, (req, res) => {
  const b = req.body;
  if (!text(b.equipment_type))
    return res.status(400).json({ error: 'Tipo de equipamento é obrigatório.' });
  try {
    const r = db
      .prepare(
        `INSERT INTO assets(hostname,equipment_type,manufacturer,model,serial,description,imei1,imei2,apple_id,reference,condition_text,city,location,status,activated_at,replaced_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        text(b.hostname),
        text(b.equipment_type),
        text(b.manufacturer),
        text(b.model),
        text(b.serial),
        text(b.description),
        text(b.imei1),
        text(b.imei2),
        text(b.apple_id),
        text(b.reference),
        text(b.condition_text),
        text(b.city),
        text(b.location),
        ['assigned', 'backup', 'maintenance', 'retired'].includes(b.status) ? b.status : 'backup',
        text(b.activated_at),
        text(b.replaced_at)
      );
    log(req.tech.name, 'create', 'asset', r.lastInsertRowid, b);
    res.json({ id: r.lastInsertRowid });
  } catch (e) {
    res.status(400).json({
      error: e.message.includes('UNIQUE')
        ? 'Já existe um equipamento com esse serial.'
        : 'Não foi possível cadastrar.'
    });
  }
});
app.put('/api/assets/:id', admin, (req, res) => {
  const b = req.body;
  db.prepare(
    `UPDATE assets SET hostname=?,equipment_type=?,manufacturer=?,model=?,serial=?,description=?,imei1=?,imei2=?,apple_id=?,reference=?,condition_text=?,city=?,location=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).run(
    text(b.hostname),
    text(b.equipment_type),
    text(b.manufacturer),
    text(b.model),
    text(b.serial),
    text(b.description),
    text(b.imei1),
    text(b.imei2),
    text(b.apple_id),
    text(b.reference),
    text(b.condition_text),
    text(b.city),
    text(b.location),
    req.params.id
  );
  log('Administrador', 'update', 'asset', req.params.id, b);
  res.json({ ok: true });
});

function performMove(assetId, toStatus, employeeToId, reason, technicianId) {
  const a = db.prepare('SELECT * FROM assets WHERE id=?').get(assetId);
  if (!a) throw new Error('Equipamento não encontrado.');
  const open = db
    .prepare('SELECT * FROM assignments WHERE asset_id=? AND returned_at IS NULL')
    .get(assetId);
  const fromEmployee = open?.employee_id || null;
  if (open)
    db.prepare('UPDATE assignments SET returned_at=CURRENT_TIMESTAMP WHERE id=?').run(open.id);
  if (toStatus === 'assigned') {
    if (!employeeToId) throw new Error('Selecione o funcionário.');
    const emp = db
      .prepare("SELECT * FROM employees WHERE id=? AND status='active'")
      .get(employeeToId);
    if (!emp) throw new Error('Funcionário ativo não encontrado.');
    db.prepare('INSERT INTO assignments(asset_id,employee_id,technician_id) VALUES(?,?,?)').run(
      assetId,
      employeeToId,
      technicianId
    );
  }
  db.prepare(
    'UPDATE assets SET status=?,retirement_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?'
  ).run(toStatus, toStatus === 'retired' ? reason : null, assetId);
  const type =
    toStatus === 'assigned'
      ? 'assign'
      : toStatus === 'backup'
        ? 'return_to_backup'
        : toStatus === 'retired'
          ? 'retire'
          : 'maintenance';
  db.prepare(
    'INSERT INTO movements(asset_id,employee_from_id,employee_to_id,from_status,to_status,movement_type,reason,technician_id) VALUES(?,?,?,?,?,?,?,?)'
  ).run(
    assetId,
    fromEmployee,
    toStatus === 'assigned' ? employeeToId : null,
    a.status,
    toStatus,
    type,
    text(reason),
    technicianId
  );
}
const moveTx = db.transaction(performMove);
app.post('/api/assets/:id/move', requireTech, (req, res) => {
  try {
    const st = req.body.to_status;
    if (!['assigned', 'backup', 'maintenance', 'retired'].includes(st))
      throw new Error('Destino inválido.');
    moveTx(
      Number(req.params.id),
      st,
      Number(req.body.employee_id) || null,
      text(req.body.reason),
      req.tech.id
    );
    log(req.tech.name, 'move', 'asset', req.params.id, req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
const offboardTx = db.transaction((empId, decisions, technician) => {
  const employee = db.prepare('SELECT id,status FROM employees WHERE id=?').get(empId);
  if (!employee || employee.status !== 'active')
    throw new Error('Funcionário ativo não encontrado.');
  const assigned = db
    .prepare(
      'SELECT a.id,a.status FROM assets a JOIN assignments s ON s.asset_id=a.id AND s.returned_at IS NULL WHERE s.employee_id=?'
    )
    .all(empId);
  for (const asset of assigned) {
    const decision = decisions[asset.id];
    if (asset.status !== 'assigned')
      throw new Error('Há um equipamento vinculado com status inconsistente.');
    if (!decision || !['backup', 'maintenance', 'retired'].includes(decision.status))
      throw new Error('Defina o destino de todos os equipamentos.');
    if (decision.status === 'retired' && !text(decision.reason))
      throw new Error('Informe o motivo da desativação.');
  }
  for (const asset of assigned) {
    const decision = decisions[asset.id];
    performMove(
      asset.id,
      decision.status,
      null,
      text(decision.reason) || 'Desligamento do funcionário',
      technician.id
    );
  }
  db.prepare(
    "UPDATE employees SET status='inactive',offboarded_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?"
  ).run(empId);
  log(technician.name, 'offboard', 'employee', empId, { assets: assigned.length });
  return assigned.length;
});
app.post('/api/employees/:id/offboard', requireTech, (req, res) => {
  try {
    const moved = offboardTx(Number(req.params.id), req.body.decisions || {}, req.tech);
    res.json({ ok: true, moved });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/tickets', (req, res) =>
  res.json(
    db
      .prepare(
        `SELECT tk.*,e.name employee_name,a.hostname,a.serial,a.equipment_type,t.name technician FROM tickets tk JOIN employees e ON e.id=tk.employee_id LEFT JOIN assets a ON a.id=tk.asset_id LEFT JOIN technicians t ON t.id=tk.technician_id ORDER BY tk.opened_at DESC LIMIT 300`
      )
      .all()
  )
);
app.get('/api/employees/:id/assets', (req, res) =>
  res.json(
    db
      .prepare(
        `SELECT a.* FROM assets a JOIN assignments s ON s.asset_id=a.id AND s.returned_at IS NULL WHERE s.employee_id=?`
      )
      .all(req.params.id)
  )
);
app.post('/api/tickets', requireTech, (req, res) => {
  const b = req.body;
  if (!Number(b.employee_id) || !text(b.description))
    return res.status(400).json({ error: 'Funcionário e descrição são obrigatórios.' });
  const n = text(b.ticket_number) || `CH-${Date.now().toString().slice(-8)}`;
  const r = db
    .prepare(
      `INSERT INTO tickets(ticket_number,employee_id,asset_id,type,priority,description,status,technician_id) VALUES(?,?,?,?,?,?,?,?)`
    )
    .run(
      n,
      Number(b.employee_id),
      Number(b.asset_id) || null,
      text(b.type),
      text(b.priority),
      text(b.description),
      'open',
      req.tech.id
    );
  log(req.tech.name, 'create', 'ticket', r.lastInsertRowid, b);
  res.json({ id: r.lastInsertRowid, ticket_number: n });
});

function sheetRows(wb, names) {
  for (const n of names) {
    const actual = wb.SheetNames.find((x) => norm(x) === norm(n));
    if (actual) return readRows(wb, actual, { header: 1, defval: null, raw: false });
  }
  return [];
}
function tableObjects(rows, expected) {
  let idx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const ns = rows[i].map(norm);
    if (expected.some((e) => ns.includes(norm(e)))) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return [];
  const headers = rows[idx].map((x) => text(x));
  return rows
    .slice(idx + 1)
    .filter((r) => r.some((v) => text(v)))
    .map((r) => Object.fromEntries(headers.map((h, i) => [norm(h), r[i]])));
}
function col(o, ...names) {
  for (const n of names) {
    const v = o[norm(n)];
    if (text(v)) return text(v);
  }
  return null;
}
app.post('/api/import/excel', admin, upload.single('file'), (req, res) => {
  let newTemplate = false;
  try {
    if (!req.file) throw new Error('Selecione uma planilha Excel.');
    const wb = readWorkbook(req.file.path);
    if (wb.SheetNames.some((name) => norm(name) === 'SENHAS'))
      throw new Error('A planilha contém uma aba de senhas. Use uma cópia sem credenciais.');
    newTemplate = wb.SheetNames.some((name) => ['FUNCIONARIOS', 'ATIVOS'].includes(norm(name)));
    if (newTemplate) return res.json(importTemplate(db, wb, req.file.originalname));
    let employees = 0,
      assets = 0,
      tickets = 0,
      skipped = 0;
    const employeeRows = tableObjects(sheetRows(wb, ['cadastro solicitante e técnicos']), [
      'NOME SOLICITANTE'
    ]);
    const insE = db.prepare(
      `INSERT INTO employees(code,name,city,department,status) VALUES(?,?,?,?, 'active')`
    );
    const existsE = db.prepare('SELECT id FROM employees WHERE name=? COLLATE NOCASE');
    for (const o of employeeRows) {
      const name = col(o, 'NOME SOLICITANTE');
      if (!name) continue;
      if (existsE.get(name)) {
        skipped++;
        continue;
      }
      insE.run(col(o, 'CÓDIGO'), name, col(o, 'CIDADE'), col(o, 'SETOR'));
      employees++;
    }
    const assetRows = tableObjects(sheetRows(wb, ['controle máquinas_Uso']), [
      'FUNCIONARIO',
      'SERIAL',
      'EQUIPAMENTO'
    ]);
    const insA = db.prepare(
      `INSERT INTO assets(hostname,equipment_type,manufacturer,model,serial,description,imei1,imei2,apple_id,reference,condition_text,city,location,activated_at,replaced_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'backup')`
    );
    const existsA = db.prepare(
      'SELECT id FROM assets WHERE serial=? OR (hostname=? AND hostname IS NOT NULL)'
    );
    for (const o of assetRows) {
      const type = col(o, 'EQUIPAMENTO');
      if (!type) continue;
      const serial = col(o, 'SERIAL'),
        host = col(o, 'HOSTNAME');
      if (existsA.get(serial || '__none__', host)) {
        skipped++;
        continue;
      }
      try {
        const r = insA.run(
          host,
          type,
          col(o, 'FABRICANTE'),
          col(o, 'MODELO'),
          serial,
          col(o, 'DESCRIÇÃO'),
          col(o, 'IMEI 1'),
          col(o, 'IMEI 2'),
          col(o, 'ID Apple'),
          col(o, 'REFERÊNCIA'),
          col(o, 'CONDIÇÕES DE USO'),
          col(o, 'CIDADE'),
          col(o, 'LOCALIDADE'),
          col(o, 'DATA DE ACTIVAÇÃO'),
          col(o, 'DATA DE TROCA')
        );
        assets++;
        const empName = col(o, 'FUNCIONARIO');
        if (empName) {
          let emp = existsE.get(empName);
          if (!emp) {
            const er = insE.run(null, empName, col(o, 'CIDADE'), col(o, 'DEPARTAMENTO'));
            emp = { id: er.lastInsertRowid };
            employees++;
          }
          db.prepare('INSERT INTO assignments(asset_id,employee_id) VALUES(?,?)').run(
            r.lastInsertRowid,
            emp.id
          );
          db.prepare("UPDATE assets SET status='assigned' WHERE id=?").run(r.lastInsertRowid);
        }
      } catch {
        skipped++;
      }
    }
    const ticketRows = tableObjects(sheetRows(wb, ['registros']), ['Nº CHAMADO', 'SOLICITANTE']);
    const findE = db.prepare('SELECT id FROM employees WHERE name=? COLLATE NOCASE');
    const findA = db.prepare('SELECT id FROM assets WHERE serial=? OR hostname=?');
    for (const o of ticketRows) {
      const employee = findE.get(col(o, 'SOLICITANTE'));
      if (!employee) {
        skipped++;
        continue;
      }
      const aid =
        findA.get(
          col(o, 'Nº DO EQUIPAMENTO') || '__none__',
          col(o, 'Nº DO EQUIPAMENTO') || '__none__'
        )?.id || null;
      db.prepare(
        `INSERT INTO tickets(ticket_number,employee_id,asset_id,type,priority,description,status,technical_opinion,opened_at,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?)`
      ).run(
        col(o, 'Nº CHAMADO'),
        employee.id,
        aid,
        col(o, 'TIPO DE CHAMADO'),
        col(o, 'PRIORIDADE'),
        col(o, 'DESCRIÇÃO') || 'Importado',
        norm(col(o, 'STATUS')).includes('FECH') ? 'closed' : 'open',
        col(o, 'PARECER TÉCNICO'),
        col(o, 'DATA ABERTURA') || new Date().toISOString(),
        col(o, 'DATA FECHAMENTO')
      );
      tickets++;
    }
    log('Administrador', 'import', 'excel', null, {
      employees,
      assets,
      tickets,
      skipped,
      filename: req.file.originalname
    });
    res.json({
      employees,
      assets,
      tickets,
      skipped,
      note: 'O importador usa somente campos autorizados de inventário/chamados e ignora outros dados da planilha.'
    });
  } catch (e) {
    console.error(e);
    res.status(400).json({
      error:
        newTemplate || e.message.includes('senhas') || !req.file
          ? e.message
          : 'Não foi possível importar o Excel. Verifique se a estrutura é compatível.'
    });
  } finally {
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (error) {
        console.error('Não foi possível remover o arquivo temporário:', error);
      }
    }
  }
});

app.get('/api/admin/audit', admin, (req, res) =>
  res.json(db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500').all())
);
app.post('/api/admin/technicians', admin, (req, res) => {
  try {
    const r = db
      .prepare('INSERT INTO technicians(name,role) VALUES(?,?)')
      .run(text(req.body.name), req.body.role === 'admin' ? 'admin' : 'technician');
    res.json({ id: r.lastInsertRowid });
  } catch {
    res.status(400).json({ error: 'Nome inválido ou já cadastrado.' });
  }
});

app.listen(PORT, () => console.log(`Inventário disponível em http://localhost:${PORT}`));
