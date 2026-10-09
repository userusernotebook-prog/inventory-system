const { ValidationError } = require('../../shared/errors');
const { text } = require('../../shared/utils/text');

function createAssetsService(db, repository, auditService) {
  return {
    list(query, status) {
      return repository.list(text(query), text(status));
    },
    create(body, technician) {
      if (!text(body.equipment_type)) {
        throw new ValidationError('Tipo de equipamento é obrigatório.');
      }
      try {
        return db.transaction(() => {
          const input = {};
          for (const field of [
            'hostname',
            'equipment_type',
            'manufacturer',
            'model',
            'serial',
            'description',
            'imei1',
            'imei2',
            'apple_id',
            'reference',
            'condition_text',
            'city',
            'location',
            'activated_at',
            'replaced_at'
          ]) {
            input[field] = text(body[field]);
          }
          input.status = ['assigned', 'backup', 'maintenance', 'retired'].includes(body.status)
            ? body.status
            : 'backup';
          const id = repository.create(input);
          auditService.log(technician.name, 'create', 'asset', id, body);
          return { id };
        })();
      } catch (error) {
        if (typeof error.code === 'string' && error.code.startsWith('SQLITE_CONSTRAINT')) {
          const message = error.message.includes('UNIQUE')
            ? 'Já existe um equipamento com esse serial.'
            : 'Não foi possível cadastrar.';
          throw new ValidationError(message);
        }
        throw error;
      }
    },
    update(id, body) {
      const input = {};
      for (const field of [
        'hostname',
        'equipment_type',
        'manufacturer',
        'model',
        'serial',
        'description',
        'imei1',
        'imei2',
        'apple_id',
        'reference',
        'condition_text',
        'city',
        'location'
      ]) {
        input[field] = text(body[field]);
      }
      db.transaction(() => {
        repository.update(id, input);
        auditService.log('Administrador', 'update', 'asset', id, body);
      })();
      return { ok: true };
    }
  };
}

module.exports = { createAssetsService };
