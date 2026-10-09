const fs = require('node:fs');
const { readWorkbook } = require('../../shared/utils/workbook-reader');
const { DomainError, ValidationError } = require('../../shared/errors');
const { norm } = require('../../shared/utils/text');
const { importTemplate } = require('./template.service');
const { importLegacy } = require('./legacy.service');

function createImportsService(db, repository, auditService) {
  return {
    importExcel(file) {
      if (!file) throw new ValidationError('Selecione uma planilha Excel.');
      let newTemplate = false;
      try {
        let workbook;
        try {
          workbook = readWorkbook(file.path);
        } catch {
          throw new ValidationError(
            'Não foi possível importar o Excel. Verifique se a estrutura é compatível.'
          );
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
            ? importTemplate(repository, workbook)
            : importLegacy(repository, workbook);
          const details = {
            employees: result.employees,
            assets: result.assets,
            ...(newTemplate ? {} : { tickets: result.tickets }),
            skipped: result.skipped,
            filename: file.originalname
          };
          auditService.log('Administrador', 'import', 'excel', null, details);
          return result;
        })();
      } catch (error) {
        if (error instanceof DomainError) throw error;
        if (!newTemplate) {
          console.error('Falha na importação legada:', error);
          throw new ValidationError(
            'Não foi possível importar o Excel. Verifique se a estrutura é compatível.'
          );
        }
        throw error;
      } finally {
        try {
          fs.unlinkSync(file.path);
        } catch (error) {
          console.error('Não foi possível remover o arquivo temporário:', error);
        }
      }
    }
  };
}

module.exports = { createImportsService };
