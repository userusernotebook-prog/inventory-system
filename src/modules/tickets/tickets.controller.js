function createTicketsController(service) {
  return {
    list(req, res) {
      res.json(service.list(req.validated.query, req.user));
    },
    create(req, res) {
      res.json(service.create(req.validated.body, req.user));
    },
    close(req, res) {
      res.json(service.close(req.validated.params.id, req.validated.body, req.user));
    }
  };
}

module.exports = { createTicketsController };
