const { ValidationError } = require('../../shared/errors');
const { text } = require('../../shared/utils/text');
const { ASSET_STATES } = require('../assets/domain/asset-state-machine');

function createAssignmentsService(
  db,
  repository,
  employeesRepository,
  movementsService,
  auditService,
  authService
) {
  return {
    listEmployeeAssets(employeeId, user) {
      const employee = employeesRepository.findById(employeeId);
      if (!employee) throw new ValidationError('Funcionário não encontrado.');
      authService.assertScope(user, employee);
      return authService.filterByScope(user, repository.listEmployeeAssets(employeeId));
    },
    offboard(employeeId, decisions, technician) {
      return db.transaction(() => {
        const id = Number(employeeId);
        const employee = employeesRepository.findById(id);
        if (!employee || employee.status !== 'active') {
          throw new ValidationError('Funcionário ativo não encontrado.');
        }
        authService.assertScope(technician, employee);
        const assigned = repository.listForOffboard(id);
        for (const asset of assigned) {
          const decision = decisions[asset.id];
          const status = movementsService.normalizeState(decision?.status);
          if (asset.status !== ASSET_STATES.IN_USE) {
            throw new ValidationError('Há um equipamento vinculado com estado inconsistente.');
          }
          if (
            !decision ||
            ![
              ASSET_STATES.BACKUP,
              ASSET_STATES.UNDER_MAINTENANCE,
              ASSET_STATES.DEACTIVATED
            ].includes(status)
          ) {
            throw new ValidationError('Defina o destino de todos os equipamentos.');
          }
          if (status === ASSET_STATES.UNDER_MAINTENANCE && !text(decision.reason)) {
            throw new ValidationError('Informe o motivo do envio para manutenção.');
          }
          if (
            status === ASSET_STATES.DEACTIVATED &&
            (!text(decision.reason) || !text(decision.technical_report))
          ) {
            throw new ValidationError('A desativação exige motivo e laudo técnico.');
          }
        }
        for (const asset of assigned) {
          const decision = decisions[asset.id];
          movementsService.performMove(
            asset.id,
            {
              toStatus: decision.status,
              reason: text(decision.reason) || 'Desligamento do funcionário',
              technicalReport: decision.technical_report
            },
            technician
          );
        }
        employeesRepository.markInactive(id);
        auditService.logUser(technician, 'offboard', 'employee', id, {
          before: { status: employee.status },
          after: { status: 'inactive', assets_moved: assigned.length }
        });
        return { ok: true, moved: assigned.length };
      })();
    }
  };
}

module.exports = { createAssignmentsService };
