const { createImportsRepository } = require('./src/modules/imports/imports.repository');
const { createAuditRepository } = require('./src/modules/audit/audit.repository');
const { createAuditService } = require('./src/modules/audit/audit.service');
const { importTemplate } = require('./src/modules/imports/template.service');

module.exports = function importInitialTemplate(db, workbook, filename) {
  const repository = createImportsRepository(db);
  const auditService = createAuditService(createAuditRepository(db));
  return db.transaction(() => {
    const result = importTemplate(repository, workbook);
    auditService.log('Administrador', 'import', 'excel', null, {
      employees: result.employees,
      assets: result.assets,
      skipped: result.skipped,
      filename
    });
    return result;
  })();
};
