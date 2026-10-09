const { Router } = require('express');
const { validate } = require('../../shared/middlewares/validate');
const { requireTechnician } = require('../../shared/middlewares/auth');
const { createMovementsController } = require('./movements.controller');
const schema = require('./movements.schema');

function createMovementsRoutes(service, authService) {
  const router = Router();
  const controller = createMovementsController(service);
  router.get('/api/assets/:id/history', validate(schema.params, 'params'), controller.history);
  router.post(
    '/api/assets/:id/move',
    requireTechnician(authService),
    validate(schema.params, 'params'),
    validate(schema.move, 'body'),
    controller.move
  );
  return router;
}

module.exports = { createMovementsRoutes };
