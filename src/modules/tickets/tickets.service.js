const { ConflictError, NotFoundError, ValidationError } = require('../../shared/errors');
const { text } = require('../../shared/utils/text');
const { pageResult } = require('../../shared/utils/query');

function createTicketsService(db, repository, auditService, employeesRepository, authService) {
  return {
    list(options, user) {
      const result = repository.list(options, authService.scopes(user));
      return pageResult({ ...options, ...result });
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
    },
    close(id, body, technician) {
      const ticket = repository.findById(Number(id));
      if (!ticket) throw new NotFoundError('Chamado não encontrado.');
      authService.assertScope(technician, ticket);
      if (ticket.status === 'closed') {
        throw new ConflictError('Este chamado já foi encerrado.');
      }
      return db.transaction(() => {
        repository.close(ticket.id, text(body.technical_opinion), technician.id);
        auditService.logUser(technician, 'close', 'ticket', ticket.id, {
          before: { status: ticket.status },
          after: { status: 'closed', technical_opinion: text(body.technical_opinion) }
        });
        return { id: ticket.id, status: 'closed' };
      })();
    }
  };
}

module.exports = { createTicketsService };
