const { Router } = require('express');
const { validate } = require('../../shared/middlewares/validate');
const { requireAdmin } = require('../../shared/middlewares/auth');
const schema = require('./auth.schema');
const { createAuthController } = require('./auth.controller');

function createAuthRoutes(service) {
  const router = Router();
  const controller = createAuthController(service);
  router.get('/api/technicians', controller.listTechnicians);
  router.post('/api/admin/login', validate(schema.login, 'body'), controller.login);
  router.post(
    '/api/admin/technicians',
    requireAdmin(service),
    validate(schema.technician, 'body'),
    controller.createTechnician
  );
  return router;
}

module.exports = { createAuthRoutes };
