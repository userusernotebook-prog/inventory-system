const { Router } = require('express');
const { validate } = require('../../shared/middlewares/validate');
const { requireAdmin, requireTechnician } = require('../../shared/middlewares/auth');
const { createAssetsController } = require('./assets.controller');
const schema = require('./assets.schema');

function createAssetsRoutes(service, authService) {
  const router = Router();
  const controller = createAssetsController(service);
  router.get('/api/assets', validate(schema.list, 'query'), controller.list);
  router.post(
    '/api/assets',
    requireTechnician(authService),
    validate(schema.body, 'body'),
    controller.create
  );
  router.put(
    '/api/assets/:id',
    requireAdmin(authService),
    validate(schema.params, 'params'),
    validate(schema.body, 'body'),
    controller.update
  );
  return router;
}

module.exports = { createAssetsRoutes };
