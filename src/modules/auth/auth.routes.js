const { Router } = require('express');
const crypto = require('node:crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
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
  const loginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const emailHash = crypto.createHash('sha256').update(email).digest('hex');
      return `${ipKeyGenerator(req.ip)}:${emailHash}`;
    }
  });
  router.post(
    '/api/auth/login',
    loginRateLimit,
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
  router.get('/api/users', ...manage, validate(schema.userList, 'query'), controller.listUsers);
  router.post('/api/users', ...manage, validate(schema.user, 'body'), controller.createUser);
  router.get('/api/users/scope-options', ...manage, controller.scopeOptions);
  router.get(
    '/api/users/:id',
    ...manage,
    validate(schema.id, 'params'),
    controller.userAdministration
  );
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
    validate(schema.reason, 'body'),
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
