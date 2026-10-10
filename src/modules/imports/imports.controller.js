const path = require('node:path');

const publicDir = path.resolve(__dirname, '..', '..', '..', 'public');

function createImportsController(service) {
  return {
    downloadTemplate(req, res) {
      res.download('modelo-importacao-inicial.xlsx', 'modelo-importacao-inicial.xlsx', {
        root: publicDir
      });
    },
    importExcel(req, res) {
      res.json(service.importExcel(req.validated.file, req.user));
    },
    previewExcel(req, res) {
      res.json(service.previewExcel(req.validated.file, req.user));
    }
  };
}

module.exports = { createImportsController };
