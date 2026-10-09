function createTicketsController(service) {
  return {
    list(req, res) {
      res.json(service.list());
    },
    create(req, res) {
      res.json(service.create(req.validated.body, req.tech));
    }
  };
}

module.exports = { createTicketsController };
