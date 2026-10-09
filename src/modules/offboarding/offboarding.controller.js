function createOffboardingController(service) {
  return {
    start(req, res) {
      res.status(201).json(service.start(req.validated.params.id, req.validated.body, req.user));
    },
    receive(req, res) {
      res.json(service.receive(req.validated.params.id, req.validated.body, req.user));
    },
    destination(req, res) {
      res.json(service.destination(req.validated.params.id, req.validated.body, req.user));
    },
    conclude(req, res) {
      res.json(service.conclude(req.validated.params.id, req.validated.body, req.user));
    },
    checklist(req, res) {
      res.json(service.checklist(req.validated.params.id, req.user));
    }
  };
}
module.exports = { createOffboardingController };
