function createAssetsController(service) {
  return {
    list(req, res) {
      res.json(service.list(req.validated.query.q, req.validated.query.status));
    },
    create(req, res) {
      res.json(service.create(req.validated.body, req.tech));
    },
    update(req, res) {
      res.json(service.update(req.validated.params.id, req.validated.body));
    }
  };
}

module.exports = { createAssetsController };
