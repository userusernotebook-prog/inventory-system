const { pageResult } = require('../../shared/utils/query');

function createAuditService(repository) {
  return {
    log(actor, action, entityType, entityId, details) {
      repository.log(actor, action, entityType, entityId, JSON.stringify(details || {}));
    },
    logUser(user, action, entityType, entityId, details) {
      repository.log(
        user.name,
        action,
        entityType,
        entityId,
        JSON.stringify(details || {}),
        user.id
      );
    },
    list: (options) => pageResult({ ...options, ...repository.list(options) })
  };
}

module.exports = { createAuditService };
