const XLSX = require('xlsx');

// A biblioteca de planilhas fica isolada da validação e gravação do inventário.
function readWorkbook(filename) {
  return XLSX.readFile(filename, { cellDates: true });
}

function readRows(workbook, sheetName, options) {
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], options);
}

module.exports = { readWorkbook, readRows };
