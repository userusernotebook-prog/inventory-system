function createAuditService(repository) {
  return {
    log(actor, action, entityType, entityId, details) {
      repository.log(actor, action, entityType, entityId, JSON.stringify(details || {}));
    },
    listRecent: () => repository.listRecent()
  };
}

module.exports = { createAuditService };
