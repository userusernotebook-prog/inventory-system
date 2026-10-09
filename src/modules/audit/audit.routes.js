const { Router } = require('express');
const { validate } = require('../../shared/middlewares/validate');
const { requirePermission } = require('../../shared/middlewares/auth');
const { createAuditController } = require('./audit.controller');
const schema = require('./audit.schema');

function createAuditRoutes(auditService, authService) {
  const router = Router();
  const controller = createAuditController(auditService);
  router.get(
    '/api/admin/audit',
    ...requirePermission(authService, 'audit:read'),
    validate(schema.query, 'query'),
    controller.list
  );
  return router;
}

module.exports = { createAuditRoutes };
