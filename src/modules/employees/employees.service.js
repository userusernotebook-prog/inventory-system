const { NotFoundError, ValidationError } = require('../../shared/errors');
const { text, optionalDate } = require('../../shared/utils/text');
const { pageResult } = require('../../shared/utils/query');

function createEmployeesService(db, repository, auditService, authService) {
  return {
    list(options, user) {
      const result = repository.list(options, authService.scopes(user));
      return pageResult({ ...options, ...result });
    },
    get(id, user) {
      const employee = repository.findById(id);
      if (!employee) throw new NotFoundError('Funcionário não encontrado.');
      authService.assertScope(user, employee);
      return employee;
    },
    create(body, technician) {
      if (!text(body.name)) throw new ValidationError('Nome é obrigatório.');
      authService.assertScope(technician, body);
      return db.transaction(() => {
        const code = text(body.code);
        if (code && repository.findCodeDuplicate(code)) {
          throw new ValidationError('Código de funcionário já cadastrado.', { field: 'code' });
        }
        const id = repository.create({
          code,
          name: text(body.name),
          email: text(body.email),
          city: text(body.city),
          department: text(body.department),
          location: text(body.location),
          corporate_phone: text(body.corporate_phone),
          personal_phone: text(body.personal_phone),
          status: body.status === 'desligado' ? 'desligado' : 'ativo'
        });
        auditService.logUser(technician, 'create', 'employee', id, {
          after: { name: text(body.name), city: text(body.city), department: text(body.department) }
        });
        return { id };
      })();
    },
    update(id, body, user) {
      const current = repository.findById(id);
      if (!current) throw new NotFoundError('Funcionário não encontrado.');
      authService.assertScope(user, current);
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
      authService.assertScope(user, updated);
      updated.hire_date = Object.hasOwn(body, 'hire_date')
        ? optionalDate(body.hire_date, 'Data de admissão')
        : current.hire_date;
      updated.offboarded_at = Object.hasOwn(body, 'offboarded_at')
        ? optionalDate(body.offboarded_at, 'Data de desligamento')
        : current.offboarded_at;
      if (current.status !== 'desligado' && updated.offboarded_at) {
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
        const changes = Object.fromEntries(
          Object.entries(updated).filter(([field, value]) => current[field] !== value)
        );
        auditService.logUser(user, 'update', 'employee', current.id, {
          before: Object.fromEntries(Object.keys(changes).map((field) => [field, current[field]])),
          after: changes
        });
      })();
      return { ok: true };
    }
  };
}

module.exports = { createEmployeesService };
