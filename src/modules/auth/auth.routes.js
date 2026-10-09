const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { validate } = require('../../shared/middlewares/validate');
const {
  requireAuthentication,
  requireOnboarding,
  requirePermission
} = require('../../shared/middlewares/auth');
const schema = require('./auth.schema');
const { createAuthController } = require('./auth.controller');

function createAuthRoutes(service) {
  const router = Router();
  const controller = createAuthController(service);
  const manage = requirePermission(service, 'user:manage');
  router.post(
    '/api/auth/login',
    rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }),
    validate(schema.login, 'body'),
    controller.login
  );
  router.post('/api/auth/logout', requireAuthentication(service), controller.logout);
  router.get('/api/auth/me', requireAuthentication(service), controller.me);
  router.post(
    '/api/auth/change-password',
    ...requireOnboarding(service),
    validate(schema.password, 'body'),
    controller.changePassword
  );
  router.post('/api/auth/totp/setup', ...requireOnboarding(service), controller.setupTotp);
  router.post(
    '/api/auth/totp/confirm',
    ...requireOnboarding(service),
    validate(schema.totp, 'body'),
    controller.confirmTotp
  );
  router.get('/api/users', ...manage, controller.listUsers);
  router.post('/api/users', ...manage, validate(schema.user, 'body'), controller.createUser);
  router.put(
    '/api/users/:id',
    ...manage,
    validate(schema.id, 'params'),
    validate(schema.userUpdate, 'body'),
    controller.updateUser
  );
  router.post(
    '/api/users/:id/reset-password',
    ...manage,
    validate(schema.id, 'params'),
    validate(schema.password, 'body'),
    controller.resetPassword
  );
  router.post(
    '/api/users/:id/force-logout',
    ...manage,
    validate(schema.id, 'params'),
    controller.forceLogout
  );
  router.put(
    '/api/users/:id/overrides',
    ...manage,
    validate(schema.id, 'params'),
    validate(schema.overrides, 'body'),
    controller.setOverrides
  );
  router.put(
    '/api/users/:id/scopes',
    ...manage,
    validate(schema.id, 'params'),
    validate(schema.scopes, 'body'),
    controller.setScopes
  );
  router.get(
    '/api/users/:id/permissions',
    ...manage,
    validate(schema.id, 'params'),
    controller.permissions
  );
  return router;
}
module.exports = { createAuthRoutes };
