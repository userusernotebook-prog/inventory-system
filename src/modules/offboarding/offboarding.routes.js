const { Router } = require('express');
const { validate } = require('../../shared/middlewares/validate');
const { requirePermission } = require('../../shared/middlewares/auth');
const schema = require('./offboarding.schema');
const { createOffboardingController } = require('./offboarding.controller');
function createOffboardingRoutes(service, authService) {
  const router = Router();
  const controller = createOffboardingController(service);
  router.post(
    '/api/employees/:id/offboarding/start',
    ...requirePermission(authService, 'employee:offboard'),
    validate(schema.id, 'params'),
    validate(schema.start, 'body'),
    controller.start
  );
  router.post(
    '/api/offboarding/assets/:id/receive',
    ...requirePermission(authService, 'asset:receive'),
    validate(schema.id, 'params'),
    validate(schema.receive, 'body'),
    controller.receive
  );
  router.post(
    '/api/offboarding/assets/:id/destination',
    ...requirePermission(authService, 'asset:update'),
    validate(schema.id, 'params'),
    validate(schema.destination, 'body'),
    controller.destination
  );
  router.post(
    '/api/employees/:id/offboarding/conclude',
    ...requirePermission(authService, 'employee:offboard'),
    validate(schema.id, 'params'),
    validate(schema.conclude, 'body'),
    controller.conclude
  );
  router.get(
    '/api/employees/:id/offboarding/checklist',
    ...requirePermission(authService, 'employee:offboard'),
    validate(schema.id, 'params'),
    controller.checklist
  );
  return router;
}
module.exports = { createOffboardingRoutes };
