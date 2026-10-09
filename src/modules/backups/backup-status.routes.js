const { Router } = require('express');
const { requirePermission } = require('../../shared/middlewares/auth');
const { createBackupStatusController } = require('./backup-status.controller');

function createBackupStatusRoutes(service, authService) {
  const router = Router();
  const controller = createBackupStatusController(service);
  router.get(
    '/api/admin/backup-status',
    ...requirePermission(authService, 'audit:read'),
    controller.latest
  );
  return router;
}

module.exports = { createBackupStatusRoutes };
