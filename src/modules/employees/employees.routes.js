const { Router } = require('express');
const { validate } = require('../../shared/middlewares/validate');
const { requirePermission } = require('../../shared/middlewares/auth');
const schema = require('./employees.schema');
const { createEmployeesController } = require('./employees.controller');

function createEmployeesRoutes(service, authService) {
  const router = Router();
  const controller = createEmployeesController(service);
  router.get(
    '/api/employees',
    ...requirePermission(authService, 'employee:read'),
    validate(schema.list, 'query'),
    controller.list
  );
  router.get(
    '/api/employees/:id',
    ...requirePermission(authService, 'employee:read'),
    validate(schema.params, 'params'),
    controller.get
  );
  router.post(
    '/api/employees',
    ...requirePermission(authService, 'employee:create'),
    validate(schema.create, 'body'),
    controller.create
  );
  router.put(
    '/api/employees/:id',
    ...requirePermission(authService, 'employee:update'),
    validate(schema.params, 'params'),
    validate(schema.body, 'body'),
    controller.update
  );
  return router;
}

module.exports = { createEmployeesRoutes };
