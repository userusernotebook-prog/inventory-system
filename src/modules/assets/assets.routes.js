const { Router } = require('express');
const { validate } = require('../../shared/middlewares/validate');
const { requirePermission } = require('../../shared/middlewares/auth');
const { createAssetsController } = require('./assets.controller');
const schema = require('./assets.schema');

function createAssetsRoutes(service, authService) {
  const router = Router();
  const controller = createAssetsController(service);
  router.get(
    '/api/assets',
    ...requirePermission(authService, 'asset:read'),
    validate(schema.list, 'query'),
    controller.list
  );
  router.post(
    '/api/assets',
    ...requirePermission(authService, 'asset:create'),
    validate(schema.create, 'body'),
    controller.create
  );
  router.put(
    '/api/assets/:id',
    ...requirePermission(authService, 'asset:update'),
    validate(schema.params, 'params'),
    validate(schema.update, 'body'),
    controller.update
  );
  return router;
}

module.exports = { createAssetsRoutes };
