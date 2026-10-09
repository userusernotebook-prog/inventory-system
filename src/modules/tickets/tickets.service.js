const { ValidationError } = require('../../shared/errors');
const { text } = require('../../shared/utils/text');

function createTicketsService(db, repository, auditService) {
  return {
    list: () => repository.list(),
    create(body, technician) {
      if (!Number(body.employee_id) || !text(body.description)) {
        throw new ValidationError('Funcionário e descrição são obrigatórios.');
      }
      const ticketNumber = text(body.ticket_number) || `CH-${Date.now().toString().slice(-8)}`;
      return db.transaction(() => {
        const id = repository.create({
          ticketNumber,
          employeeId: Number(body.employee_id),
          assetId: Number(body.asset_id) || null,
          type: text(body.type),
          priority: text(body.priority),
          description: text(body.description),
          technicianId: technician.id
        });
        auditService.log(technician.name, 'create', 'ticket', id, body);
        return { id, ticket_number: ticketNumber };
      })();
    }
  };
}

module.exports = { createTicketsService };
