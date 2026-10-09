function createBackupStatusController(service) {
  return { latest: (req, res) => res.json(service.getLatest()) };
}

module.exports = { createBackupStatusController };
