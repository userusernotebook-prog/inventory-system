const { Router } = require('express');
const { validate } = require('../../shared/middlewares/validate');
const { requireTechnician } = require('../../shared/middlewares/auth');
const { createTicketsController } = require('./tickets.controller');
const schema = require('./tickets.schema');

function createTicketsRoutes(service, authService) {
  const router = Router();
  const controller = createTicketsController(service);
  router.get('/api/tickets', validate(schema.list, 'query'), controller.list);
  router.post(
    '/api/tickets',
    requireTechnician(authService),
    validate(schema.body, 'body'),
    controller.create
  );
  return router;
}

module.exports = { createTicketsRoutes };
