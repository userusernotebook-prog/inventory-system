function createDashboardController(service) {
  return {
    summary(req, res) {
      res.json(service.summary(req.user));
    },
    report(req, res) {
      res.json(service.report(req.validated.query, req.user));
    }
  };
}

module.exports = { createDashboardController };
