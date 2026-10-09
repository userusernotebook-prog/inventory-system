const { ValidationError } = require('../../shared/errors');
const { text } = require('../../shared/utils/text');

function movementType(status) {
  if (status === 'assigned') return 'assign';
  if (status === 'backup') return 'return_to_backup';
  if (status === 'retired') return 'retire';
  return 'maintenance';
}

function createMovementsService(
  db,
  assetsRepository,
  employeesRepository,
  assignmentsRepository,
  movementsRepository,
  auditService
) {
  function performMove(assetId, toStatus, employeeToId, reason, technicianId) {
    const asset = assetsRepository.findById(assetId);
    if (!asset) throw new ValidationError('Equipamento não encontrado.');
    const open = assignmentsRepository.findOpenForAsset(assetId);
    const fromEmployeeId = open?.employee_id || null;
    if (open) assignmentsRepository.close(open.id);
    if (toStatus === 'assigned') {
      if (!employeeToId) throw new ValidationError('Selecione o funcionário.');
      if (!employeesRepository.findActiveById(employeeToId)) {
        throw new ValidationError('Funcionário ativo não encontrado.');
      }
      assignmentsRepository.create(assetId, employeeToId, technicianId);
    }
    assetsRepository.updateStatus(assetId, toStatus, toStatus === 'retired' ? reason : null);
    movementsRepository.create({
      assetId,
      fromEmployeeId,
      toEmployeeId: toStatus === 'assigned' ? employeeToId : null,
      fromStatus: asset.status,
      toStatus,
      type: movementType(toStatus),
      reason: text(reason),
      technicianId
    });
  }

  return {
    performMove,
    listAssetHistory: (assetId) => movementsRepository.listAssetHistory(assetId),
    move(assetId, body, technician) {
      const status = body.to_status;
      if (!['assigned', 'backup', 'maintenance', 'retired'].includes(status)) {
        throw new ValidationError('Destino inválido.');
      }
      db.transaction(() => {
        performMove(
          Number(assetId),
          status,
          Number(body.employee_id) || null,
          text(body.reason),
          technician.id
        );
        auditService.log(technician.name, 'move', 'asset', assetId, body);
      })();
      return { ok: true };
    }
  };
}

module.exports = { createMovementsService };
