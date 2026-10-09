const express = require('express');
const path = require('node:path');
const { errorHandler } = require('./shared/middlewares/error-handler');
const { requireAuthentication, requireCompletedOnboarding } = require('./shared/middlewares/auth');

const { createAuthRepository } = require('./modules/auth/auth.repository');
const { createAuthService } = require('./modules/auth/auth.service');
const { createAuthRoutes } = require('./modules/auth/auth.routes');
const { createAuditRepository } = require('./modules/audit/audit.repository');
const { createAuditService } = require('./modules/audit/audit.service');
const { createAuditRoutes } = require('./modules/audit/audit.routes');
const { createEmployeesRepository } = require('./modules/employees/employees.repository');
const { createEmployeesService } = require('./modules/employees/employees.service');
const { createEmployeesRoutes } = require('./modules/employees/employees.routes');
const { createAssetsRepository } = require('./modules/assets/assets.repository');
const { createAssetsService } = require('./modules/assets/assets.service');
const { createAssetsRoutes } = require('./modules/assets/assets.routes');
const { createAssignmentsRepository } = require('./modules/assignments/assignments.repository');
const { createAssignmentsService } = require('./modules/assignments/assignments.service');
const { createAssignmentsRoutes } = require('./modules/assignments/assignments.routes');
const { createMovementsRepository } = require('./modules/movements/movements.repository');
const { createMovementsService } = require('./modules/movements/movements.service');
const { createMovementsRoutes } = require('./modules/movements/movements.routes');
const { createTicketsRepository } = require('./modules/tickets/tickets.repository');
const { createTicketsService } = require('./modules/tickets/tickets.service');
const { createTicketsRoutes } = require('./modules/tickets/tickets.routes');
const { createImportsRepository } = require('./modules/imports/imports.repository');
const { createImportsService } = require('./modules/imports/imports.service');
const { createImportsRoutes } = require('./modules/imports/imports.routes');
const { createDashboardRepository } = require('./modules/dashboard/dashboard.repository');
const { createDashboardService } = require('./modules/dashboard/dashboard.service');
const { createDashboardRoutes } = require('./modules/dashboard/dashboard.routes');

// No Node 24/Windows, carregue os módulos JS antes de abrir o addon SQLite.
const db = require('./db/connection');
const auditService = createAuditService(createAuditRepository(db));
const authService = createAuthService(createAuthRepository(db), auditService);
const employeesRepository = createEmployeesRepository(db);
const assetsRepository = createAssetsRepository(db);
const assignmentsRepository = createAssignmentsRepository(db);
const movementsRepository = createMovementsRepository(db);

const employeesService = createEmployeesService(db, employeesRepository, auditService, authService);
const assetsService = createAssetsService(db, assetsRepository, auditService, authService);
const movementsService = createMovementsService(
  db,
  assetsRepository,
  employeesRepository,
  assignmentsRepository,
  movementsRepository,
  auditService,
  authService
);
const assignmentsService = createAssignmentsService(
  db,
  assignmentsRepository,
  employeesRepository,
  movementsService,
  auditService,
  authService
);
const ticketsService = createTicketsService(
  db,
  createTicketsRepository(db),
  auditService,
  employeesRepository,
  authService
);
const importsService = createImportsService(db, createImportsRepository(db), auditService);
const dashboardService = createDashboardService(createDashboardRepository(db));

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(createAuthRoutes(authService));
app.use('/api', requireAuthentication(authService));
app.use('/api', requireCompletedOnboarding);
app.use(createAuditRoutes(auditService, authService));
app.use(createDashboardRoutes(dashboardService, authService));
app.use(createEmployeesRoutes(employeesService, authService));
app.use(createAssetsRoutes(assetsService, authService));
app.use(createMovementsRoutes(movementsService, authService));
app.use(createAssignmentsRoutes(assignmentsService, authService));
app.use(createTicketsRoutes(ticketsService, authService));
app.use(createImportsRoutes(importsService, authService));
app.use(express.static(path.resolve(__dirname, '..', 'public')));
app.use(errorHandler);

module.exports = app;
