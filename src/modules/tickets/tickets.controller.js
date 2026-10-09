function createTicketsController(service) {
  return {
    list(req, res) {
      res.json(service.list(req.user));
    },
    create(req, res) {
      res.json(service.create(req.validated.body, req.user));
    }
  };
}

module.exports = { createTicketsController };
