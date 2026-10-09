function createAuditController(service) {
  return {
    list(req, res) {
      res.json(service.list(req.validated.query));
    }
  };
}

module.exports = { createAuditController };
