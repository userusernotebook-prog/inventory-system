function createMovementsController(service) {
  return {
    history(req, res) {
      res.json(service.listAssetHistory(req.validated.params.id, req.user));
    },
    move(req, res) {
      res.json(service.move(req.validated.params.id, req.validated.body, req.user));
    }
  };
}

module.exports = { createMovementsController };
