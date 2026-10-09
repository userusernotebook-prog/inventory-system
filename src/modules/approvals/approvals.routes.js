const { Router } = require('express');
const { validate } = require('../../shared/middlewares/validate');
const { requirePermission } = require('../../shared/middlewares/auth');
const schema = require('./approvals.schema');
const { createApprovalsController } = require('./approvals.controller');
function createApprovalsRoutes(service, authService) {
  const router = Router();
  const controller = createApprovalsController(service);
  router.get(
    '/api/approval-requests',
    ...requirePermission(authService, 'request:create'),
    validate(schema.list, 'query'),
    controller.list
  );
  router.get(
    '/api/approval-requests/pending-count',
    ...requirePermission(authService, 'request:approve'),
    controller.pendingCount
  );
  router.get(
    '/api/approval-requests/:id',
    ...requirePermission(authService, 'request:create'),
    validate(schema.params, 'params'),
    controller.get
  );
  router.post(
    '/api/approval-requests',
    ...requirePermission(authService, 'request:create'),
    validate(schema.create, 'body'),
    controller.create
  );
  router.post(
    '/api/approval-requests/:id/approve',
    ...requirePermission(authService, 'request:approve'),
    validate(schema.params, 'params'),
    controller.approve
  );
  router.post(
    '/api/approval-requests/:id/reject',
    ...requirePermission(authService, 'request:approve'),
    validate(schema.params, 'params'),
    validate(schema.reject, 'body'),
    controller.reject
  );
  router.post(
    '/api/approval-requests/:id/cancel',
    ...requirePermission(authService, 'request:create'),
    validate(schema.params, 'params'),
    controller.cancel
  );
  router.get(
    '/api/notifications',
    ...requirePermission(authService, 'request:create'),
    controller.notifications
  );
  return router;
}
module.exports = { createApprovalsRoutes };
