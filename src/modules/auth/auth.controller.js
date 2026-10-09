function createAuthController(service) {
  return {
    listTechnicians(req, res) {
      res.json(service.listTechnicians());
    },
    login(req, res) {
      res.json(service.login(req.validated.body.password));
    },
    createTechnician(req, res) {
      res.json(service.createTechnician(req.validated.body));
    }
  };
}

module.exports = { createAuthController };
