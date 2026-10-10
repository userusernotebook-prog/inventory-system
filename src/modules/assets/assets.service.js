const { ValidationError } = require('../../shared/errors');
const { NotFoundError } = require('../../shared/errors');
const { text } = require('../../shared/utils/text');
const { ASSET_STATES } = require('./domain/asset-state-machine');
const { pageResult } = require('../../shared/utils/query');

function createAssetsService(db, repository, auditService, authService) {
  function present(asset, user) {
    const value = { ...asset };
    if (typeof authService.can !== 'function' || !authService.can(user, 'asset:view_value')) {
      delete value.acquisition_value;
    }
    return value;
  }

  return {
    list(options, user) {
      const result = repository.list(options, authService.scopes(user));
      return pageResult({ ...options, ...result, items: result.items.map((asset) => present(asset, user)) });
    },
    get(id, user) {
      const asset = repository.findById(id);
      if (!asset) throw new NotFoundError('Ativo não encontrado.');
      authService.assertScope(user, asset);
      return present(asset, user);
    },
    create(body, technician) {
      if (!text(body.equipment_type)) {
        throw new ValidationError('Tipo de equipamento é obrigatório.');
      }
      authService.assertScope(technician, body);
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
            'acquisition_value',
            'activated_at',
            'replaced_at'
          ]) {
            input[field] = text(body[field]);
          }
          input.acquisition_value = body.acquisition_value === '' ? null : body.acquisition_value;
          if (input.acquisition_value !== undefined && input.acquisition_value !== null) {
            authService.authorize(technician, 'asset:view_value');
          }
          // O cadastro cria um ativo disponível. Toda mudança posterior de estado
          // passa obrigatoriamente pela máquina de estados no módulo movements.
          input.status = ASSET_STATES.AVAILABLE;
          const id = repository.create(input);
          auditService.logUser(technician, 'create', 'asset', id, {
            after: { equipment_type: input.equipment_type, serial: input.serial, city: input.city }
          });
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
    update(id, body, user) {
      const current = repository.findById(id);
      if (!current) throw new ValidationError('Equipamento não encontrado.');
      authService.assertScope(user, current);
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
        'acquisition_value'
      ]) {
        input[field] = Object.hasOwn(body, field) ? text(body[field]) : current[field];
      }
      input.acquisition_value = Object.hasOwn(body, 'acquisition_value')
        ? body.acquisition_value === ''
          ? null
          : body.acquisition_value
        : current.acquisition_value;
      if (input.acquisition_value !== current.acquisition_value) {
        authService.authorize(user, 'asset:view_value');
      }
      authService.assertScope(user, input);
      db.transaction(() => {
        repository.update(id, input);
        const changes = Object.fromEntries(
          Object.entries(input).filter(([field, value]) => current[field] !== value)
        );
        auditService.logUser(user, 'update', 'asset', id, {
          before: Object.fromEntries(Object.keys(changes).map((field) => [field, current[field]])),
          after: changes
        });
      })();
      return { ok: true };
    }
  };
}

module.exports = { createAssetsService };
