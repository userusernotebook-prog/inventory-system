const { NotFoundError, ValidationError } = require('../../shared/errors');
const { text, optionalDate } = require('../../shared/utils/text');

function createEmployeesService(db, repository, auditService) {
  return {
    list(query) {
      return repository.list(text(query));
    },
    get(id) {
      const employee = repository.findById(id);
      if (!employee) throw new NotFoundError('Funcionário não encontrado.');
      return employee;
    },
    create(body, technician) {
      if (!text(body.name)) throw new ValidationError('Nome é obrigatório.');
      return db.transaction(() => {
        const id = repository.create({
          code: text(body.code),
          name: text(body.name),
          email: text(body.email),
          city: text(body.city),
          department: text(body.department),
          location: text(body.location),
          corporate_phone: text(body.corporate_phone),
          personal_phone: text(body.personal_phone),
          status: body.status === 'inactive' ? 'inactive' : 'active'
        });
        auditService.log(technician.name, 'create', 'employee', id, body);
        return { id };
      })();
    },
    update(id, body) {
      const current = repository.findById(id);
      if (!current) throw new NotFoundError('Funcionário não encontrado.');
      if (body.status !== undefined && body.status !== current.status) {
        throw new ValidationError('Altere o status pelo fluxo de desligamento.');
      }

      const fields = [
        'code',
        'name',
        'email',
        'department',
        'cost_center',
        'city',
        'location',
        'corporate_phone',
        'personal_phone'
      ];
      const updated = {};
      for (const field of fields) {
        updated[field] = Object.hasOwn(body, field) ? text(body[field]) : current[field];
      }
      if (!updated.name) throw new ValidationError('Nome é obrigatório.');
      updated.hire_date = Object.hasOwn(body, 'hire_date')
        ? optionalDate(body.hire_date, 'Data de admissão')
        : current.hire_date;
      updated.offboarded_at = Object.hasOwn(body, 'offboarded_at')
        ? optionalDate(body.offboarded_at, 'Data de desligamento')
        : current.offboarded_at;
      if (current.status === 'active' && updated.offboarded_at) {
        throw new ValidationError(
          'A data de desligamento só pode ser preenchida após o desligamento.'
        );
      }
      if (current.offboarded_at && updated.offboarded_at === current.offboarded_at.slice(0, 10)) {
        updated.offboarded_at = current.offboarded_at;
      }
      if (updated.code && repository.findCodeDuplicate(updated.code, current.id)) {
        throw new ValidationError('Já existe um funcionário com esse código.');
      }
      db.transaction(() => {
        repository.update(current.id, updated);
        auditService.log('Administrador', 'update', 'employee', current.id, updated);
      })();
      return { ok: true };
    }
  };
}

module.exports = { createEmployeesService };
