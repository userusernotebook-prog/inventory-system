function createAssignmentsController(service) {
  return {
    listEmployeeAssets(req, res) {
      res.json(service.listEmployeeAssets(req.validated.params.id, req.user));
    }
  };
}

module.exports = { createAssignmentsController };
