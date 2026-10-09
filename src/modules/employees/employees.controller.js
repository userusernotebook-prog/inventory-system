function createEmployeesController(service) {
  return {
    list(req, res) {
      res.json(service.list(req.validated.query.q));
    },
    get(req, res) {
      res.json(service.get(req.validated.params.id));
    },
    create(req, res) {
      res.json(service.create(req.validated.body, req.tech));
    },
    update(req, res) {
      res.json(service.update(req.validated.params.id, req.validated.body));
    }
  };
}

module.exports = { createEmployeesController };
