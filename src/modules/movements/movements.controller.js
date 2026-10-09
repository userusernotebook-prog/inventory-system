function createMovementsController(service) {
  return {
    history(req, res) {
      res.json(service.listAssetHistory(req.validated.params.id));
    },
    move(req, res) {
      res.json(service.move(req.validated.params.id, req.validated.body, req.tech));
    }
  };
}

module.exports = { createMovementsController };
