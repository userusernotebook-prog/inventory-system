const { Router } = require('express');
const { validate } = require('../../shared/middlewares/validate');
const { requirePermission } = require('../../shared/middlewares/auth');
const { createAssignmentsController } = require('./assignments.controller');
const schema = require('./assignments.schema');

function createAssignmentsRoutes(service, authService) {
  const router = Router();
  const controller = createAssignmentsController(service);
  router.get(
    '/api/employees/:id/assets',
    ...requirePermission(authService, 'asset:read'),
    validate(schema.params, 'params'),
    controller.listEmployeeAssets
  );
  return router;
}

module.exports = { createAssignmentsRoutes };
