const { readRows } = require('../../shared/utils/workbook-reader');
const { text, norm } = require('../../shared/utils/text');
const { ValidationError } = require('../../shared/errors');
const { ASSET_STATES } = require('../assets/domain/asset-state-machine');

const RESTRICTED_POLICY = Object.freeze({
  initialLoad: false,
  createEmployees: false,
  inScope: () => true
});

function sheetRows(workbook, names) {
  for (const name of names) {
    const actual = workbook.SheetNames.find((sheet) => norm(sheet) === norm(name));
    if (actual) return readRows(workbook, actual, { header: 1, defval: null, raw: false });
  }
  return [];
}

function tableObjects(rows, expected) {
  let headerIndex = -1;
  for (let index = 0; index < Math.min(rows.length, 20); index++) {
    const normalized = rows[index].map(norm);
    if (expected.some((name) => normalized.includes(norm(name)))) {
      headerIndex = index;
      break;
    }
  }
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map(text);
  return rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((value) => text(value)))
    .map((row) => Object.fromEntries(headers.map((header, index) => [norm(header), row[index]])));
}

function col(row, ...names) {
  for (const name of names) {
    const value = row[norm(name)];
    if (text(value)) return text(value);
  }
  return null;
}

// A planilha legada é uma carga histórica (funcionários, ativos em uso e
// chamados): exige import:initial_load. Equipamento legado sem dono é usado,
// então entra em BACKUP (nunca em DISPONIVEL, regra R1).
function importLegacy(repository, workbook, responsibleUserId, policy = RESTRICTED_POLICY) {
  if (!policy.initialLoad) {
    throw new ValidationError(
      'A planilha legada é uma carga inicial e exige a permissão import:initial_load.'
    );
  }
  let employees = 0;
  let assets = 0;
  let tickets = 0;
  let skipped = 0;

  function createEmployee(sheet, line, code, name, city, department) {
    if (!policy.createEmployees) {
      throw new ValidationError(
        `${sheet}, linha ${line}: criar funcionários exige a permissão employee:create.`
      );
    }
    if (!policy.inScope({ city, department })) {
      throw new ValidationError(`${sheet}, linha ${line}: funcionário fora do seu alcance.`);
    }
    employees++;
    const id = repository.insertLegacyEmployee(code, name, city, department);
    return { id, status: 'ativo', city, department };
  }

  const employeeRows = tableObjects(sheetRows(workbook, ['cadastro solicitante e técnicos']), [
    'NOME SOLICITANTE'
  ]);
  employeeRows.forEach((row, index) => {
    const name = col(row, 'NOME SOLICITANTE');
    if (!name) return;
    if (repository.findEmployeeByName(name)) {
      skipped++;
      return;
    }
    createEmployee(
      'cadastro solicitante e técnicos',
      index + 2,
      col(row, 'CÓDIGO'),
      name,
      col(row, 'CIDADE'),
      col(row, 'SETOR')
    );
  });

  const assetRows = tableObjects(sheetRows(workbook, ['controle máquinas_Uso']), [
    'FUNCIONARIO',
    'SERIAL',
    'EQUIPAMENTO'
  ]);
  assetRows.forEach((row, index) => {
    const line = index + 2;
    const type = col(row, 'EQUIPAMENTO');
    if (!type) return;
    const serial = col(row, 'SERIAL');
    const hostname = col(row, 'HOSTNAME');
    if (repository.legacyAssetExists(serial || '__none__', hostname)) {
      skipped++;
      return;
    }
    const employeeName = col(row, 'FUNCIONARIO');
    let employee = null;
    if (employeeName) {
      employee =
        repository.findEmployeeByName(employeeName) ||
        createEmployee(
          'controle máquinas_Uso',
          line,
          null,
          employeeName,
          col(row, 'CIDADE'),
          col(row, 'DEPARTAMENTO')
        );
    }
    const holder = employee && employee.status === 'ativo' ? employee : null;
    const status = holder ? ASSET_STATES.IN_USE : ASSET_STATES.BACKUP;
    if (
      !policy.inScope({
        city: col(row, 'CIDADE'),
        equipment_type: type,
        department: holder ? (holder.department ?? null) : null
      })
    ) {
      throw new ValidationError(
        `controle máquinas_Uso, linha ${line}: cidade, tipo ou departamento fora do seu alcance.`
      );
    }
    const assetId = repository.insertLegacyAsset({
      hostname,
      type,
      manufacturer: col(row, 'FABRICANTE'),
      model: col(row, 'MODELO'),
      serial,
      description: col(row, 'DESCRIÇÃO'),
      imei1: col(row, 'IMEI 1'),
      imei2: col(row, 'IMEI 2'),
      appleId: col(row, 'ID Apple'),
      reference: col(row, 'REFERÊNCIA'),
      conditionText: col(row, 'CONDIÇÕES DE USO'),
      city: col(row, 'CIDADE'),
      location: col(row, 'LOCALIDADE'),
      activatedAt: col(row, 'DATA DE ACTIVAÇÃO'),
      replacedAt: col(row, 'DATA DE TROCA'),
      status
    });
    if (holder) repository.insertAssignment(assetId, holder.id, responsibleUserId);
    repository.insertInitialMovement(
      assetId,
      holder ? holder.id : null,
      status,
      'Carga inicial (planilha legada)',
      null,
      responsibleUserId
    );
    assets++;
  });

  const ticketRows = tableObjects(sheetRows(workbook, ['registros']), [
    'Nº CHAMADO',
    'SOLICITANTE'
  ]);
  ticketRows.forEach((row, index) => {
    const employee = repository.findEmployeeByName(col(row, 'SOLICITANTE'));
    if (!employee) {
      skipped++;
      return;
    }
    const equipment = col(row, 'Nº DO EQUIPAMENTO') || '__none__';
    const asset = repository.findLegacyAsset(equipment);
    if (
      !policy.inScope({
        city: employee.city,
        department: employee.department,
        equipment_type: asset ? asset.equipment_type : null
      })
    ) {
      throw new ValidationError(`registros, linha ${index + 2}: chamado fora do seu alcance.`);
    }
    repository.insertLegacyTicket({
      ticketNumber: col(row, 'Nº CHAMADO'),
      employeeId: employee.id,
      assetId: asset ? asset.id : null,
      type: col(row, 'TIPO DE CHAMADO'),
      priority: col(row, 'PRIORIDADE'),
      description: col(row, 'DESCRIÇÃO') || 'Importado',
      status: norm(col(row, 'STATUS')).includes('FECH') ? 'closed' : 'open',
      technicalOpinion: col(row, 'PARECER TÉCNICO'),
      openedAt: col(row, 'DATA ABERTURA') || new Date().toISOString(),
      closedAt: col(row, 'DATA FECHAMENTO'),
      responsibleUserId
    });
    tickets++;
  });

  return {
    employees,
    assets,
    tickets,
    skipped,
    note: 'O importador usa somente campos autorizados de inventário/chamados e ignora outros dados da planilha.'
  };
}

module.exports = { importLegacy };
