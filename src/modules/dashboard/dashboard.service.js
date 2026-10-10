const { ValidationError } = require('../../shared/errors');
const { text } = require('../../shared/utils/text');
const { ASSET_STATES } = require('../assets/domain/asset-state-machine');

function createDashboardService(repository, authService) {
  // Contagens respeitam o alcance; nomes só com employee:read e listas de
  // chamados só com ticket:read.
  const visibility = (user) => ({
    employees: authService.can(user, 'employee:read'),
    tickets: authService.can(user, 'ticket:read')
  });
  return {
    summary: (user) => repository.summary(authService.scopes(user), visibility(user)),
    report(query, user) {
      const filters = {
        year: text(query.year),
        month: text(query.month),
        ticketStatus: text(query.ticketStatus),
        ticketType: text(query.ticketType),
        assetStatus: text(query.assetStatus),
        assetType: text(query.assetType)
      };
      if (filters.year && !/^\d{4}$/.test(filters.year)) {
        throw new ValidationError('Ano inválido.');
      }
      if (filters.month && !/^(0?[1-9]|1[0-2])$/.test(filters.month)) {
        throw new ValidationError('Mês inválido.');
      }
      if (
        filters.ticketStatus &&
        !['open', 'in_progress', 'closed', 'cancelled'].includes(filters.ticketStatus)
      ) {
        throw new ValidationError('Status de chamado inválido.');
      }
      if (filters.assetStatus && !Object.values(ASSET_STATES).includes(filters.assetStatus)) {
        throw new ValidationError('Status de ativo inválido.');
      }
      return repository.report(filters, authService.scopes(user), visibility(user));
    }
  };
}

module.exports = { createDashboardService };
