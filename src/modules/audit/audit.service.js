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
    listRecent: () => repository.listRecent()
  };
}

module.exports = { createAuditService };
