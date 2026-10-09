const { Router } = require('express');
const { validate } = require('../../shared/middlewares/validate');
const { requireTechnician } = require('../../shared/middlewares/auth');
const { createAssignmentsController } = require('./assignments.controller');
const schema = require('./assignments.schema');

function createAssignmentsRoutes(service, authService) {
  const router = Router();
  const controller = createAssignmentsController(service);
  router.get(
    '/api/employees/:id/assets',
    validate(schema.params, 'params'),
    controller.listEmployeeAssets
  );
  router.post(
    '/api/employees/:id/offboard',
    requireTechnician(authService),
    validate(schema.params, 'params'),
    validate(schema.offboard, 'body'),
    controller.offboard
  );
  return router;
}

module.exports = { createAssignmentsRoutes };
