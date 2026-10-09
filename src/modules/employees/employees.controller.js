function createEmployeesController(service) {
  return {
    list(req, res) {
      res.json(service.list(req.validated.query.q, req.user));
    },
    get(req, res) {
      res.json(service.get(req.validated.params.id, req.user));
    },
    create(req, res) {
      res.json(service.create(req.validated.body, req.user));
    },
    update(req, res) {
      res.json(service.update(req.validated.params.id, req.validated.body, req.user));
    }
  };
}

module.exports = { createEmployeesController };
