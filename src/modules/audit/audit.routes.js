const { Router } = require('express');
const { validate } = require('../../shared/middlewares/validate');
const { requireAdmin } = require('../../shared/middlewares/auth');
const { createAuditController } = require('./audit.controller');
const schema = require('./audit.schema');

function createAuditRoutes(auditService, authService) {
  const router = Router();
  const controller = createAuditController(auditService);
  router.get(
    '/api/admin/audit',
    requireAdmin(authService),
    validate(schema.query, 'query'),
    controller.list
  );
  return router;
}

module.exports = { createAuditRoutes };
