const { readRows } = require('../../shared/utils/workbook-reader');
const { ValidationError } = require('../../shared/errors');

const clean = (value) => (value == null ? '' : String(value).trim());
const key = (value) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();

function readSheet(workbook, name, required) {
  const actual = workbook.SheetNames.find((sheet) => key(sheet) === key(name));
  if (!actual) throw new ValidationError(`A aba ${name} não foi encontrada.`);
  const rows = readRows(workbook, actual, { header: 1, defval: '', raw: false });
  const headers = (rows[0] || []).map(key);
  for (const label of required) {
    if (!headers.includes(key(label))) {
      throw new ValidationError(`Falta a coluna ${label} na aba ${name}.`);
    }
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
    if (!match) {
      throw new ValidationError(`${sheet}, linha ${line}: ${label} deve estar em DD/MM/AAAA.`);
    }
    [, day, month, year] = match;
  }
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new ValidationError(`${sheet}, linha ${line}: ${label} contém uma data inválida.`);
  }
  return `${year}-${month}-${day}`;
}

const assetStatuses = {
  EMUSO: 'assigned',
  BACKUP: 'backup',
  MANUTENCAO: 'maintenance',
  DESATIVADO: 'retired'
};

function importTemplate(repository, workbook) {
  const employees = readSheet(workbook, 'Funcionarios', ['CÓDIGO', 'NOME', 'STATUS']);
  const assets = readSheet(workbook, 'Ativos', [
    'CÓDIGO FUNCIONÁRIO',
    'EQUIPAMENTO',
    'SERIAL',
    'REFERÊNCIA',
    'STATUS'
  ]);
  if (!employees.length && !assets.length) {
    throw new ValidationError('Preencha ao menos uma linha nas abas Funcionarios ou Ativos.');
  }

  const technicianId = repository.activeAdminId();
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
    if (!code || !name) {
      throw new ValidationError(`Funcionarios, linha ${row.line}: informe CÓDIGO e NOME.`);
    }
    if (!['ATIVO', 'DESLIGADO'].includes(statusText)) {
      throw new ValidationError(
        `Funcionarios, linha ${row.line}: STATUS deve ser Ativo ou Desligado.`
      );
    }
    if (seenCodes.has(key(code))) {
      throw new ValidationError(`Funcionarios, linha ${row.line}: CÓDIGO repetido na planilha.`);
    }
    seenCodes.add(key(code));

    const existing = repository.employeesByCode(code);
    if (existing.length > 1) {
      throw new ValidationError(`Funcionarios, linha ${row.line}: CÓDIGO duplicado no sistema.`);
    }
    if (existing.length) {
      if (key(existing[0].name) !== key(name)) {
        throw new ValidationError(
          `Funcionarios, linha ${row.line}: CÓDIGO já pertence a outro nome no sistema.`
        );
      }
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
    if (statusText === 'ATIVO' && offboardedAt) {
      throw new ValidationError(
        `Funcionarios, linha ${row.line}: funcionário ativo não pode ter DATA DE DESLIGAMENTO.`
      );
    }
    const status = statusText === 'ATIVO' ? 'active' : 'inactive';
    const id = repository.insertTemplateEmployee({
      code,
      name,
      email: field(row, 'E-MAIL') || null,
      department: field(row, 'DEPARTAMENTO') || null,
      costCenter: field(row, 'CENTRO DE CUSTO') || null,
      city: field(row, 'CIDADE') || null,
      location: field(row, 'LOCALIDADE') || null,
      corporatePhone: field(row, 'TELEFONE CORPORATIVO') || null,
      personalPhone: field(row, 'TELEFONE PESSOAL') || null,
      status,
      hireDate,
      offboardedAt
    });
    employeeIds.set(key(code), { id, status });
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
    if (!type || !status) {
      throw new ValidationError(
        `Ativos, linha ${row.line}: informe EQUIPAMENTO e um STATUS válido.`
      );
    }
    if (!serial && !reference) {
      throw new ValidationError(`Ativos, linha ${row.line}: informe SERIAL ou REFERÊNCIA única.`);
    }
    if (status === 'assigned' && !employeeCode) {
      throw new ValidationError(
        `Ativos, linha ${row.line}: equipamento Em uso precisa de CÓDIGO FUNCIONÁRIO.`
      );
    }
    if (status !== 'assigned' && employeeCode) {
      throw new ValidationError(
        `Ativos, linha ${row.line}: deixe CÓDIGO FUNCIONÁRIO vazio quando não estiver Em uso.`
      );
    }
    if (status === 'retired' && !reason) {
      throw new ValidationError(
        `Ativos, linha ${row.line}: informe o MOTIVO / OBSERVAÇÃO da desativação.`
      );
    }

    const serialKey = key(serial);
    const referenceKey = key(reference);
    if (serialKey && seenSerials.has(serialKey)) {
      throw new ValidationError(`Ativos, linha ${row.line}: SERIAL repetido na planilha.`);
    }
    if (referenceKey && seenReferences.has(referenceKey)) {
      throw new ValidationError(`Ativos, linha ${row.line}: REFERÊNCIA repetida na planilha.`);
    }
    if (serialKey) seenSerials.add(serialKey);
    if (referenceKey) seenReferences.add(referenceKey);
    if (serial && repository.hasSerial(serial)) {
      throw new ValidationError(`Ativos, linha ${row.line}: SERIAL já cadastrado no sistema.`);
    }
    if (reference && repository.hasReference(reference)) {
      throw new ValidationError(`Ativos, linha ${row.line}: REFERÊNCIA já cadastrada no sistema.`);
    }

    let employeeId = null;
    if (status === 'assigned') {
      let employee = employeeIds.get(key(employeeCode));
      if (!employee) {
        const matches = repository.employeesByCode(employeeCode);
        if (matches.length !== 1) {
          throw new ValidationError(
            `Ativos, linha ${row.line}: CÓDIGO FUNCIONÁRIO não encontrado ou ambíguo.`
          );
        }
        employee = matches[0];
      }
      if (employee.status !== 'active') {
        throw new ValidationError(
          `Ativos, linha ${row.line}: funcionário desligado não pode receber equipamento.`
        );
      }
      employeeId = employee.id;
    }

    const id = repository.insertTemplateAsset({
      type,
      hostname: field(row, 'HOSTNAME') || null,
      manufacturer: field(row, 'FABRICANTE') || null,
      model: field(row, 'MODELO') || null,
      serial: serial || null,
      reference: reference || null,
      description: field(row, 'DESCRIÇÃO') || null,
      imei1: field(row, 'IMEI 1') || null,
      imei2: field(row, 'IMEI 2') || null,
      appleId: field(row, 'ID APPLE') || null,
      conditionText: field(row, 'CONDIÇÕES DE USO') || null,
      city: field(row, 'CIDADE') || null,
      location: field(row, 'LOCALIDADE') || null,
      status,
      retirementReason: status === 'retired' ? reason : null
    });
    if (employeeId) repository.insertAssignment(id, employeeId, technicianId);
    repository.insertInitialMovement(
      id,
      employeeId,
      status,
      reason || 'Importação inicial',
      technicianId
    );
    createdAssets++;
  }

  return {
    employees: createdEmployees,
    assets: createdAssets,
    tickets: 0,
    skipped,
    note: 'Importação inicial concluída. Vínculos e estados iniciais registrados no histórico.'
  };
}

module.exports = { importTemplate };
