const fs = require('node:fs');
const { readWorkbook } = require('../../shared/utils/workbook-reader');
const { DomainError, ValidationError } = require('../../shared/errors');
const { norm } = require('../../shared/utils/text');
const { importTemplate } = require('./template.service');
const { importLegacy } = require('./legacy.service');

function createImportsService(db, repository, auditService) {
  return {
    importExcel(file, user) {
      if (!file) throw new ValidationError('Selecione uma planilha Excel.');
      let newTemplate = false;
      try {
        let workbook;
        try {
          workbook = readWorkbook(file.path);
        } catch {
          throw new ValidationError('Não foi possível importar o Excel. Verifique a estrutura.');
        }
        if (workbook.SheetNames.some((name) => norm(name) === 'SENHAS')) {
          throw new ValidationError(
            'A planilha contém uma aba de senhas. Use uma cópia sem credenciais.'
          );
        }
        newTemplate = workbook.SheetNames.some((name) =>
          ['FUNCIONARIOS', 'ATIVOS'].includes(norm(name))
        );
        return db.transaction(() => {
          const result = newTemplate
            ? importTemplate(repository, workbook, user.id)
            : importLegacy(repository, workbook, user.id);
          const details = {
            employees: result.employees,
            assets: result.assets,
            ...(newTemplate ? {} : { tickets: result.tickets }),
            skipped: result.skipped,
            filename: file.originalname
          };
          auditService.logUser(user, 'import', 'excel', null, { after: details });
          return result;
        })();
      } catch (error) {
        if (error instanceof DomainError) throw error;
        console.error(
          JSON.stringify({
            level: 'warn',
            event: newTemplate ? 'template_import_failed' : 'legacy_import_failed'
          })
        );
        throw new ValidationError('Não foi possível importar o Excel. Verifique a estrutura.');
      } finally {
        try {
          fs.unlinkSync(file.path);
        } catch {
          console.error(JSON.stringify({ level: 'warn', event: 'upload_cleanup_failed' }));
        }
      }
    }
  };
}

module.exports = { createImportsService };
