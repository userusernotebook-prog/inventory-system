const { ValidationError } = require('../../shared/errors');
const { text } = require('../../shared/utils/text');
const { ASSET_STATES } = require('../assets/domain/asset-state-machine');

function createDashboardService(repository) {
  return {
    summary: () => repository.summary(),
    report(query) {
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
      return repository.report(filters);
    }
  };
}

module.exports = { createDashboardService };
