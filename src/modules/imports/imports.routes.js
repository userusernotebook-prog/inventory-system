const path = require('node:path');
const { Router } = require('express');
const multer = require('multer');
const { validate } = require('../../shared/middlewares/validate');
const { requireAdmin } = require('../../shared/middlewares/auth');
const { createImportsController } = require('./imports.controller');
const schema = require('./imports.schema');

const upload = multer({
  dest: path.resolve(__dirname, '..', '..', '..', 'data', 'uploads'),
  limits: { fileSize: 15 * 1024 * 1024 }
});

function createImportsRoutes(service, authService) {
  const router = Router();
  const controller = createImportsController(service);
  router.get('/api/templates/initial', controller.downloadTemplate);
  router.post(
    '/api/import/excel',
    requireAdmin(authService),
    upload.single('file'),
    validate(schema.file, 'file'),
    controller.importExcel
  );
  return router;
}

module.exports = { createImportsRoutes };
