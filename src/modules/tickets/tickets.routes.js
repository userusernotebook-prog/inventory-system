const { Router } = require('express');
const { validate } = require('../../shared/middlewares/validate');
const { requirePermission } = require('../../shared/middlewares/auth');
const { createTicketsController } = require('./tickets.controller');
const schema = require('./tickets.schema');

function createTicketsRoutes(service, authService) {
  const router = Router();
  const controller = createTicketsController(service);
  router.get(
    '/api/tickets',
    ...requirePermission(authService, 'ticket:read'),
    validate(schema.list, 'query'),
    controller.list
  );
  router.post(
    '/api/tickets',
    ...requirePermission(authService, 'ticket:create'),
    validate(schema.body, 'body'),
    controller.create
  );
  router.post(
    '/api/tickets/:id/close',
    ...requirePermission(authService, 'ticket:close'),
    validate(schema.params, 'params'),
    validate(schema.close, 'body'),
    controller.close
  );
  return router;
}

module.exports = { createTicketsRoutes };
