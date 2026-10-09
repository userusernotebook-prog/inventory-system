const { Router } = require('express');
const { validate } = require('../../shared/middlewares/validate');
const { requirePermission } = require('../../shared/middlewares/auth');
const { createDashboardController } = require('./dashboard.controller');
const schema = require('./dashboard.schema');

function createDashboardRoutes(service, authService) {
  const router = Router();
  const controller = createDashboardController(service);
  router.get(
    '/api/dashboard',
    ...requirePermission(authService, 'asset:read'),
    validate(schema.query, 'query'),
    controller.summary
  );
  router.get(
    '/api/dashboard/report',
    ...requirePermission(authService, 'asset:read'),
    validate(schema.query, 'query'),
    controller.report
  );
  return router;
}

module.exports = { createDashboardRoutes };
