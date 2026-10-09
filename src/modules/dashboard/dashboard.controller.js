function createDashboardController(service) {
  return {
    summary(req, res) {
      res.json(service.summary());
    },
    report(req, res) {
      res.json(service.report(req.validated.query));
    }
  };
}

module.exports = { createDashboardController };
