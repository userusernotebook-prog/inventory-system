function createAuditController(service) {
  return {
    list(req, res) {
      res.json(service.listRecent());
    }
  };
}

module.exports = { createAuditController };
