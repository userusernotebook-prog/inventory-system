function createApprovalsController(service) {
  return {
    create(req, res) {
      res.status(201).json(service.create(req.validated.body, req.user));
    },
    list(req, res) {
      res.json(service.list(req.validated.query, req.user));
    },
    get(req, res) {
      res.json(service.get(req.validated.params.id, req.user));
    },
    approve(req, res) {
      res.json(service.approve(req.validated.params.id, req.user));
    },
    reject(req, res) {
      res.json(service.reject(req.validated.params.id, req.validated.body.reason, req.user));
    },
    cancel(req, res) {
      res.json(service.cancel(req.validated.params.id, req.user));
    },
    pendingCount(req, res) {
      res.json({ count: service.pendingCount(req.user) });
    },
    notifications(req, res) {
      res.json(service.notifications(req.user));
    }
  };
}
module.exports = { createApprovalsController };
