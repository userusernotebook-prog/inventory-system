const { ForbiddenError, ValidationError } = require('../../shared/errors');

function createAssignmentsService(repository, employeesRepository, authService) {
  return {
    listEmployeeAssets(employeeId, user) {
      const scopes = authService.scopes(user);
      if (!employeesRepository.findById(employeeId, scopes)) {
        if (scopes.length && employeesRepository.findById(employeeId)) {
          throw new ForbiddenError('Seu alcance não permite acessar este registro.');
        }
        throw new ValidationError('Funcionário não encontrado.');
      }

      const showValue = authService.can(user, 'asset:view_value');
      return repository.listEmployeeAssets(employeeId, scopes).map((asset) => {
        if (showValue) return asset;
        const visible = { ...asset };
        delete visible.acquisition_value;
        return visible;
      });
    }
  };
}

module.exports = { createAssignmentsService };
