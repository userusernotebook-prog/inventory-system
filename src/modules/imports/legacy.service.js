const { readRows } = require('../../shared/utils/workbook-reader');
const { text, norm } = require('../../shared/utils/text');

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

function importLegacy(repository, workbook) {
  let employees = 0;
  let assets = 0;
  let tickets = 0;
  let skipped = 0;

  const employeeRows = tableObjects(sheetRows(workbook, ['cadastro solicitante e técnicos']), [
    'NOME SOLICITANTE'
  ]);
  for (const row of employeeRows) {
    const name = col(row, 'NOME SOLICITANTE');
    if (!name) continue;
    if (repository.findEmployeeByName(name)) {
      skipped++;
      continue;
    }
    repository.insertLegacyEmployee(
      col(row, 'CÓDIGO'),
      name,
      col(row, 'CIDADE'),
      col(row, 'SETOR')
    );
    employees++;
  }

  const assetRows = tableObjects(sheetRows(workbook, ['controle máquinas_Uso']), [
    'FUNCIONARIO',
    'SERIAL',
    'EQUIPAMENTO'
  ]);
  for (const row of assetRows) {
    const type = col(row, 'EQUIPAMENTO');
    if (!type) continue;
    const serial = col(row, 'SERIAL');
    const hostname = col(row, 'HOSTNAME');
    if (repository.legacyAssetExists(serial || '__none__', hostname)) {
      skipped++;
      continue;
    }
    try {
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
        replacedAt: col(row, 'DATA DE TROCA')
      });
      assets++;
      const employeeName = col(row, 'FUNCIONARIO');
      if (employeeName) {
        let employee = repository.findEmployeeByName(employeeName);
        if (!employee) {
          employee = {
            id: repository.insertLegacyEmployee(
              null,
              employeeName,
              col(row, 'CIDADE'),
              col(row, 'DEPARTAMENTO')
            )
          };
          employees++;
        }
        repository.assignLegacyAsset(assetId, employee.id);
      }
    } catch (error) {
      skipped++;
      console.warn('Ativo legado ignorado após falha de gravação:', error.code || error.name);
    }
  }

  const ticketRows = tableObjects(sheetRows(workbook, ['registros']), [
    'Nº CHAMADO',
    'SOLICITANTE'
  ]);
  for (const row of ticketRows) {
    const employee = repository.findEmployeeByName(col(row, 'SOLICITANTE'));
    if (!employee) {
      skipped++;
      continue;
    }
    const equipment = col(row, 'Nº DO EQUIPAMENTO') || '__none__';
    const assetId = repository.findLegacyAsset(equipment)?.id || null;
    repository.insertLegacyTicket({
      ticketNumber: col(row, 'Nº CHAMADO'),
      employeeId: employee.id,
      assetId,
      type: col(row, 'TIPO DE CHAMADO'),
      priority: col(row, 'PRIORIDADE'),
      description: col(row, 'DESCRIÇÃO') || 'Importado',
      status: norm(col(row, 'STATUS')).includes('FECH') ? 'closed' : 'open',
      technicalOpinion: col(row, 'PARECER TÉCNICO'),
      openedAt: col(row, 'DATA ABERTURA') || new Date().toISOString(),
      closedAt: col(row, 'DATA FECHAMENTO')
    });
    tickets++;
  }

  return {
    employees,
    assets,
    tickets,
    skipped,
    note: 'O importador usa somente campos autorizados de inventário/chamados e ignora outros dados da planilha.'
  };
}

module.exports = { importLegacy };
