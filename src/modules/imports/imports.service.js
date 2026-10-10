const fs = require('node:fs');
const { readWorkbook } = require('../../shared/utils/workbook-reader');
const { DomainError, ValidationError } = require('../../shared/errors');
const { norm } = require('../../shared/utils/text');
const { importTemplate } = require('./template.service');
const { importLegacy } = require('./legacy.service');

class PreviewComplete extends Error {
  constructor(result) {
    super('PREVIEW_COMPLETE');
    this.result = result;
  }
}

function cleanUpload(file) {
  try {
    fs.unlinkSync(file.path);
  } catch {
    console.error(JSON.stringify({ level: 'warn', event: 'upload_cleanup_failed' }));
  }
}

function readAndClassify(file) {
  let workbook;
  try {
    workbook = readWorkbook(file.path);
  } catch {
    throw new ValidationError('Não foi possível ler o Excel. Verifique a estrutura.');
  }
  if (workbook.SheetNames.some((name) => norm(name) === 'SENHAS')) {
    throw new ValidationError('A planilha contém uma aba de senhas. Use uma cópia sem credenciais.');
  }
  const isTemplate = workbook.SheetNames.some((name) =>
    ['FUNCIONARIOS', 'ATIVOS'].includes(norm(name))
  );
  return { workbook, isTemplate };
}

function validationError(error) {
  const match = /^([^,]+), linha (\d+):\s*(.+)$/u.exec(error.message);
  return {
    sheet: match?.[1] || null,
    line: match ? Number(match[2]) : null,
    message: match?.[3] || error.message
  };
}

function createImportsService(db, repository, auditService) {
  const execute = (workbook, isTemplate, userId) =>
    isTemplate
      ? importTemplate(repository, workbook, userId)
      : importLegacy(repository, workbook, userId);

  return {
    importExcel(file, user) {
      if (!file) throw new ValidationError('Selecione uma planilha Excel.');
      let isTemplate = false;
      try {
        const classified = readAndClassify(file);
        isTemplate = classified.isTemplate;
        return db.transaction(() => {
          const result = execute(classified.workbook, isTemplate, user.id);
          const details = {
            employees: result.employees,
            assets: result.assets,
            ...(isTemplate ? {} : { tickets: result.tickets }),
            skipped: result.skipped,
            filename: file.originalname
          };
          auditService.logUser(user, 'import', 'excel', null, { after: details });
          return result;
        })();
      } catch (error) {
        if (error instanceof DomainError) throw error;
        console.error(
          JSON.stringify({ level: 'warn', event: isTemplate ? 'template_import_failed' : 'legacy_import_failed' })
        );
        throw new ValidationError('Não foi possível importar o Excel. Verifique a estrutura.');
      } finally {
        cleanUpload(file);
      }
    },

    previewExcel(file, user) {
      if (!file) throw new ValidationError('Selecione uma planilha Excel.');
      let isTemplate = false;
      try {
        const classified = readAndClassify(file);
        isTemplate = classified.isTemplate;
        const format = isTemplate ? 'MODELO_INICIAL' : 'LEGADO';
        try {
          db.transaction(() => {
            const result = execute(classified.workbook, isTemplate, user.id);
            // Deliberately aborts the transaction: preview never persists data.
            throw new PreviewComplete(result);
          })();
        } catch (error) {
          if (error instanceof PreviewComplete) {
            return { valid: true, format, summary: error.result, errors: [] };
          }
          if (error instanceof DomainError) {
            return { valid: false, format, summary: null, errors: [validationError(error)] };
          }
          throw error;
        }
      } catch (error) {
        if (error instanceof DomainError) throw error;
        console.error(
          JSON.stringify({ level: 'warn', event: isTemplate ? 'template_preview_failed' : 'legacy_preview_failed' })
        );
        throw new ValidationError('Não foi possível validar o Excel. Verifique a estrutura.');
      } finally {
        cleanUpload(file);
      }
    }
  };
}

module.exports = { createImportsService };
