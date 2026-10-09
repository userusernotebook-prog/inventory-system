function createAssignmentsController(service) {
  return {
    listEmployeeAssets(req, res) {
      res.json(service.listEmployeeAssets(req.validated.params.id, req.user));
    },
    offboard(req, res) {
      res.json(
        service.offboard(req.validated.params.id, req.validated.body.decisions || {}, req.user)
      );
    }
  };
}

module.exports = { createAssignmentsController };
