const { ValidationError } = require('../../shared/errors');
const { text } = require('../../shared/utils/text');

function createAssignmentsService(
  db,
  repository,
  employeesRepository,
  movementsService,
  auditService
) {
  return {
    listEmployeeAssets: (employeeId) => repository.listEmployeeAssets(employeeId),
    offboard(employeeId, decisions, technician) {
      return db.transaction(() => {
        const id = Number(employeeId);
        const employee = employeesRepository.findById(id);
        if (!employee || employee.status !== 'active') {
          throw new ValidationError('Funcionário ativo não encontrado.');
        }
        const assigned = repository.listForOffboard(id);
        for (const asset of assigned) {
          const decision = decisions[asset.id];
          if (asset.status !== 'assigned') {
            throw new ValidationError('Há um equipamento vinculado com status inconsistente.');
          }
          if (!decision || !['backup', 'maintenance', 'retired'].includes(decision.status)) {
            throw new ValidationError('Defina o destino de todos os equipamentos.');
          }
          if (decision.status === 'retired' && !text(decision.reason)) {
            throw new ValidationError('Informe o motivo da desativação.');
          }
        }
        for (const asset of assigned) {
          const decision = decisions[asset.id];
          movementsService.performMove(
            asset.id,
            decision.status,
            null,
            text(decision.reason) || 'Desligamento do funcionário',
            technician.id
          );
        }
        employeesRepository.markInactive(id);
        auditService.log(technician.name, 'offboard', 'employee', id, {
          assets: assigned.length
        });
        return { ok: true, moved: assigned.length };
      })();
    }
  };
}

module.exports = { createAssignmentsService };
