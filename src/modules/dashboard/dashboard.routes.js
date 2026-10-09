const { Router } = require('express');
const { validate } = require('../../shared/middlewares/validate');
const { createDashboardController } = require('./dashboard.controller');
const schema = require('./dashboard.schema');

function createDashboardRoutes(service) {
  const router = Router();
  const controller = createDashboardController(service);
  router.get('/api/dashboard', controller.summary);
  router.get('/api/dashboard/report', validate(schema.query, 'query'), controller.report);
  return router;
}

module.exports = { createDashboardRoutes };
