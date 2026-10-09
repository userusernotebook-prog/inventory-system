const { readRows } = require('./workbook-reader');

const clean = (value) => (value == null ? '' : String(value).trim());
const key = (value) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();

function readSheet(workbook, name, required) {
  const actual = workbook.SheetNames.find((sheet) => key(sheet) === key(name));
  if (!actual) throw new Error(`A aba ${name} não foi encontrada.`);
  const rows = readRows(workbook, actual, { header: 1, defval: '', raw: false });
  const headers = (rows[0] || []).map(key);
  for (const label of required) {
    if (!headers.includes(key(label))) throw new Error(`Falta a coluna ${label} na aba ${name}.`);
  }
  return rows
    .slice(1)
    .map((values, index) => ({
      line: index + 2,
      values: Object.fromEntries(headers.map((header, column) => [header, clean(values[column])]))
    }))
    .filter((row) => Object.values(row.values).some(Boolean));
}

const field = (row, label) => row.values[key(label)] || '';

function dateOnly(value, sheet, line, label) {
  if (!value) return null;
  let year, month, day;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) [, year, month, day] = match;
  else {
    match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (!match) throw new Error(`${sheet}, linha ${line}: ${label} deve estar em DD/MM/AAAA.`);
    [, day, month, year] = match;
  }
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new Error(`${sheet}, linha ${line}: ${label} contém uma data inválida.`);
  }
  return `${year}-${month}-${day}`;
}

const assetStatuses = {
  EMUSO: 'assigned',
  BACKUP: 'backup',
  MANUTENCAO: 'maintenance',
  DESATIVADO: 'retired'
};

module.exports = function importTemplate(db, workbook, filename) {
  const employees = readSheet(workbook, 'Funcionarios', ['CÓDIGO', 'NOME', 'STATUS']);
  const assets = readSheet(workbook, 'Ativos', [
    'CÓDIGO FUNCIONÁRIO',
    'EQUIPAMENTO',
    'SERIAL',
    'REFERÊNCIA',
    'STATUS'
  ]);
  if (!employees.length && !assets.length)
    throw new Error('Preencha ao menos uma linha nas abas Funcionarios ou Ativos.');

  return db.transaction(() => {
    const technicianId =
      db
        .prepare("SELECT id FROM technicians WHERE role='admin' AND active=1 ORDER BY id LIMIT 1")
        .get()?.id || null;
    const employeeIds = new Map();
    const seenCodes = new Set();
    const seenSerials = new Set();
    const seenReferences = new Set();
    let createdEmployees = 0;
    let skipped = 0;

    for (const row of employees) {
      const code = field(row, 'CÓDIGO');
      const name = field(row, 'NOME');
      const statusText = key(field(row, 'STATUS') || 'Ativo');
      if (!code || !name)
        throw new Error(`Funcionarios, linha ${row.line}: informe CÓDIGO e NOME.`);
      if (!['ATIVO', 'DESLIGADO'].includes(statusText))
        throw new Error(`Funcionarios, linha ${row.line}: STATUS deve ser Ativo ou Desligado.`);
      if (seenCodes.has(key(code)))
        throw new Error(`Funcionarios, linha ${row.line}: CÓDIGO repetido na planilha.`);
      seenCodes.add(key(code));

      const existing = db
        .prepare('SELECT id,name,status FROM employees WHERE code=? COLLATE NOCASE')
        .all(code);
      if (existing.length > 1)
        throw new Error(`Funcionarios, linha ${row.line}: CÓDIGO duplicado no sistema.`);
      if (existing.length) {
        if (key(existing[0].name) !== key(name))
          throw new Error(
            `Funcionarios, linha ${row.line}: CÓDIGO já pertence a outro nome no sistema.`
          );
        employeeIds.set(key(code), existing[0]);
        skipped++;
        continue;
      }

      const hireDate = dateOnly(
        field(row, 'DATA DE ADMISSÃO'),
        'Funcionarios',
        row.line,
        'DATA DE ADMISSÃO'
      );
      const offboardedAt = dateOnly(
        field(row, 'DATA DE DESLIGAMENTO'),
        'Funcionarios',
        row.line,
        'DATA DE DESLIGAMENTO'
      );
      if (statusText === 'ATIVO' && offboardedAt)
        throw new Error(
          `Funcionarios, linha ${row.line}: funcionário ativo não pode ter DATA DE DESLIGAMENTO.`
        );
      const status = statusText === 'ATIVO' ? 'active' : 'inactive';
      const result = db
        .prepare(
          `INSERT INTO employees
        (code,name,email,department,cost_center,city,location,corporate_phone,personal_phone,status,hire_date,offboarded_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          code,
          name,
          field(row, 'E-MAIL') || null,
          field(row, 'DEPARTAMENTO') || null,
          field(row, 'CENTRO DE CUSTO') || null,
          field(row, 'CIDADE') || null,
          field(row, 'LOCALIDADE') || null,
          field(row, 'TELEFONE CORPORATIVO') || null,
          field(row, 'TELEFONE PESSOAL') || null,
          status,
          hireDate,
          offboardedAt
        );
      employeeIds.set(key(code), { id: result.lastInsertRowid, status });
      createdEmployees++;
    }

    let createdAssets = 0;
    for (const row of assets) {
      const type = field(row, 'EQUIPAMENTO');
      const serial = field(row, 'SERIAL');
      const reference = field(row, 'REFERÊNCIA');
      const employeeCode = field(row, 'CÓDIGO FUNCIONÁRIO');
      const status = assetStatuses[key(field(row, 'STATUS'))];
      const reason = field(row, 'MOTIVO / OBSERVAÇÃO');
      if (!type || !status)
        throw new Error(`Ativos, linha ${row.line}: informe EQUIPAMENTO e um STATUS válido.`);
      if (!serial && !reference)
        throw new Error(`Ativos, linha ${row.line}: informe SERIAL ou REFERÊNCIA única.`);
      if (status === 'assigned' && !employeeCode)
        throw new Error(
          `Ativos, linha ${row.line}: equipamento Em uso precisa de CÓDIGO FUNCIONÁRIO.`
        );
      if (status !== 'assigned' && employeeCode)
        throw new Error(
          `Ativos, linha ${row.line}: deixe CÓDIGO FUNCIONÁRIO vazio quando não estiver Em uso.`
        );
      if (status === 'retired' && !reason)
        throw new Error(`Ativos, linha ${row.line}: informe o MOTIVO / OBSERVAÇÃO da desativação.`);

      const serialKey = key(serial),
        referenceKey = key(reference);
      if (serialKey && seenSerials.has(serialKey))
        throw new Error(`Ativos, linha ${row.line}: SERIAL repetido na planilha.`);
      if (referenceKey && seenReferences.has(referenceKey))
        throw new Error(`Ativos, linha ${row.line}: REFERÊNCIA repetida na planilha.`);
      if (serialKey) seenSerials.add(serialKey);
      if (referenceKey) seenReferences.add(referenceKey);
      if (serial && db.prepare('SELECT id FROM assets WHERE serial=? COLLATE NOCASE').get(serial))
        throw new Error(`Ativos, linha ${row.line}: SERIAL já cadastrado no sistema.`);
      if (
        reference &&
        db.prepare('SELECT id FROM assets WHERE reference=? COLLATE NOCASE').get(reference)
      )
        throw new Error(`Ativos, linha ${row.line}: REFERÊNCIA já cadastrada no sistema.`);

      let employeeId = null;
      if (status === 'assigned') {
        let employee = employeeIds.get(key(employeeCode));
        if (!employee) {
          const matches = db
            .prepare('SELECT id,status FROM employees WHERE code=? COLLATE NOCASE')
            .all(employeeCode);
          if (matches.length !== 1)
            throw new Error(
              `Ativos, linha ${row.line}: CÓDIGO FUNCIONÁRIO não encontrado ou ambíguo.`
            );
          employee = matches[0];
        }
        if (employee.status !== 'active')
          throw new Error(
            `Ativos, linha ${row.line}: funcionário desligado não pode receber equipamento.`
          );
        employeeId = employee.id;
      }

      const result = db
        .prepare(
          `INSERT INTO assets
        (equipment_type,hostname,manufacturer,model,serial,reference,description,imei1,imei2,apple_id,condition_text,city,location,status,retirement_reason)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          type,
          field(row, 'HOSTNAME') || null,
          field(row, 'FABRICANTE') || null,
          field(row, 'MODELO') || null,
          serial || null,
          reference || null,
          field(row, 'DESCRIÇÃO') || null,
          field(row, 'IMEI 1') || null,
          field(row, 'IMEI 2') || null,
          field(row, 'ID APPLE') || null,
          field(row, 'CONDIÇÕES DE USO') || null,
          field(row, 'CIDADE') || null,
          field(row, 'LOCALIDADE') || null,
          status,
          status === 'retired' ? reason : null
        );
      if (employeeId)
        db.prepare('INSERT INTO assignments(asset_id,employee_id,technician_id) VALUES(?,?,?)').run(
          result.lastInsertRowid,
          employeeId,
          technicianId
        );
      db.prepare(
        `INSERT INTO movements
        (asset_id,employee_to_id,from_status,to_status,movement_type,reason,technician_id)
        VALUES(?,?,NULL,?,'initial_import',?,?)`
      ).run(
        result.lastInsertRowid,
        employeeId,
        status,
        reason || 'Importação inicial',
        technicianId
      );
      createdAssets++;
    }

    db.prepare('INSERT INTO audit_log(actor,action,entity_type,details) VALUES(?,?,?,?)').run(
      'Administrador',
      'import',
      'excel',
      JSON.stringify({ employees: createdEmployees, assets: createdAssets, skipped, filename })
    );
    return {
      employees: createdEmployees,
      assets: createdAssets,
      tickets: 0,
      skipped,
      note: 'Importação inicial concluída. Vínculos e estados iniciais registrados no histórico.'
    };
  })();
};
