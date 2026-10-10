const path = require('node:path');
const { Router } = require('express');
const multer = require('multer');
const { validate } = require('../../shared/middlewares/validate');
const { requirePermission } = require('../../shared/middlewares/auth');
const { createImportsController } = require('./imports.controller');
const schema = require('./imports.schema');

const upload = multer({
  dest: path.resolve(__dirname, '..', '..', '..', 'data', 'uploads'),
  limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 5 },
  fileFilter(req, file, callback) {
    const validName = /\.xlsx$/i.test(file.originalname) || /\.xlsm$/i.test(file.originalname);
    // MIME comes from the client and is often omitted by browsers. The extension
    // is an early filter; workbook parsing below is the authoritative validation.
    callback(validName ? null : new multer.MulterError('LIMIT_UNEXPECTED_FILE'), validName);
  }
});

function createImportsRoutes(service, authService) {
  const router = Router();
  const controller = createImportsController(service);
  router.get(
    '/api/templates/initial',
    ...requirePermission(authService, 'asset:create'),
    controller.downloadTemplate
  );
  router.post(
    '/api/import/excel/preview',
    ...requirePermission(authService, 'asset:create'),
    upload.single('file'),
    validate(schema.file, 'file'),
    controller.previewExcel
  );
  router.post(
    '/api/import/excel',
    ...requirePermission(authService, 'asset:create'),
    upload.single('file'),
    validate(schema.file, 'file'),
    controller.importExcel
  );
  return router;
}

module.exports = { createImportsRoutes };
