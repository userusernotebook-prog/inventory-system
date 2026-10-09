const { ValidationError } = require('../../shared/errors');
const { text } = require('../../shared/utils/text');

function createTicketsService(db, repository, auditService, employeesRepository, authService) {
  return {
    list(user) {
      return authService.filterByScope(user, repository.list());
    },
    create(body, technician) {
      if (!Number(body.employee_id) || !text(body.description)) {
        throw new ValidationError('Funcionário e descrição são obrigatórios.');
      }
      const employee = employeesRepository.findActiveById(Number(body.employee_id));
      if (!employee) throw new ValidationError('Funcionário ativo não encontrado.');
      authService.assertScope(technician, employee);
      const ticketNumber = text(body.ticket_number) || `CH-${Date.now().toString().slice(-8)}`;
      return db.transaction(() => {
        const id = repository.create({
          ticketNumber,
          employeeId: Number(body.employee_id),
          assetId: Number(body.asset_id) || null,
          type: text(body.type),
          priority: text(body.priority),
          description: text(body.description),
          responsibleUserId: technician.id
        });
        auditService.logUser(technician, 'create', 'ticket', id, {
          after: { employee_id: Number(body.employee_id), asset_id: Number(body.asset_id) || null }
        });
        return { id, ticket_number: ticketNumber };
      })();
    }
  };
}

module.exports = { createTicketsService };
