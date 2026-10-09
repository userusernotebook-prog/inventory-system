const { Router } = require('express');
const { validate } = require('../../shared/middlewares/validate');
const { requireAdmin, requireTechnician } = require('../../shared/middlewares/auth');
const schema = require('./employees.schema');
const { createEmployeesController } = require('./employees.controller');

function createEmployeesRoutes(service, authService) {
  const router = Router();
  const controller = createEmployeesController(service);
  router.get('/api/employees', validate(schema.list, 'query'), controller.list);
  router.get('/api/employees/:id', validate(schema.params, 'params'), controller.get);
  router.post(
    '/api/employees',
    requireTechnician(authService),
    validate(schema.body, 'body'),
    controller.create
  );
  router.put(
    '/api/employees/:id',
    requireAdmin(authService),
    validate(schema.params, 'params'),
    validate(schema.body, 'body'),
    controller.update
  );
  return router;
}

module.exports = { createEmployeesRoutes };
