const { ValidationError } = require('../../shared/errors');
const { text } = require('../../shared/utils/text');
const {
  ASSET_STATES,
  AssetStateTransitionError,
  validateTransition
} = require('../assets/domain/asset-state-machine');

const legacyStates = Object.freeze({
  assigned: ASSET_STATES.IN_USE,
  backup: ASSET_STATES.BACKUP,
  maintenance: ASSET_STATES.UNDER_MAINTENANCE,
  retired: ASSET_STATES.DEACTIVATED
});

function normalizeState(value) {
  const state = String(value || '').trim();
  return legacyStates[state] || state;
}

function throwAsValidationError(error) {
  if (error instanceof AssetStateTransitionError) {
    throw new ValidationError(error.message);
  }
  throw error;
}

function createMovementsService(
  db,
  assetsRepository,
  employeesRepository,
  assignmentsRepository,
  movementsRepository,
  auditService,
  authService
) {
  function performMove(assetId, input, user) {
    const asset = assetsRepository.findById(assetId);
    if (!asset) throw new ValidationError('Equipamento não encontrado.');
    authService.assertScope(user, asset);

    const openAssignment = assignmentsRepository.findOpenForAsset(assetId);
    const fromEmployeeId = openAssignment?.employee_id || null;
    const toStatus = normalizeState(input.toStatus);
    const employeeToId = Number(input.employeeToId) || null;
    const reason = text(input.reason);
    const technicalReport = text(input.technicalReport);
    let rule;
    try {
      rule = validateTransition({
        fromStatus: asset.status,
        toStatus,
        employeeFromId: fromEmployeeId,
        employeeToId,
        reason,
        technicalReport
      });
    } catch (error) {
      throwAsValidationError(error);
    }
    authService.authorize(user, rule.permission);

    if (toStatus === ASSET_STATES.IN_USE) {
      const employee = employeesRepository.findActiveById(employeeToId);
      if (!employee) throw new ValidationError('Funcionário ativo não encontrado.');
      authService.assertScope(user, employee);
    }

    if (openAssignment) assignmentsRepository.close(openAssignment.id);
    if (toStatus === ASSET_STATES.IN_USE) {
      assignmentsRepository.create(assetId, employeeToId, user.id);
    }

    assetsRepository.updateStatus(
      assetId,
      toStatus,
      toStatus === ASSET_STATES.DEACTIVATED ? reason : null
    );
    movementsRepository.create({
      assetId,
      fromEmployeeId,
      toEmployeeId: toStatus === ASSET_STATES.IN_USE ? employeeToId : null,
      fromStatus: asset.status,
      toStatus,
      type: rule.movementType,
      reason,
      technicalReport,
      responsibleUserId: user.id,
      occurredAt: new Date().toISOString()
    });
    return {
      ...rule,
      previousStatus: asset.status,
      fromEmployeeId,
      toEmployeeId: toStatus === ASSET_STATES.IN_USE ? employeeToId : null
    };
  }

  return {
    performMove,
    normalizeState,
    listAssetHistory(assetId, user) {
      const asset = assetsRepository.findById(assetId);
      if (!asset) throw new ValidationError('Equipamento não encontrado.');
      authService.assertScope(user, asset);
      return movementsRepository.listAssetHistory(assetId);
    },
    move(assetId, body, technician) {
      const rule = db.transaction(() => {
        const currentRule = performMove(
          Number(assetId),
          {
            toStatus: body.to_status,
            employeeToId: body.employee_id,
            reason: body.reason,
            technicalReport: body.technical_report
          },
          technician
        );
        auditService.logUser(technician, 'move', 'asset', assetId, {
          before: { status: currentRule.previousStatus, employee_id: currentRule.fromEmployeeId },
          after: { status: body.to_status, employee_id: currentRule.toEmployeeId },
          reason: text(body.reason)
        });
        return currentRule;
      })();
      return {
        ok: true,
        transition: {
          movement_type: rule.movementType,
          permission: rule.permission,
          requires_approval: rule.requiresApproval
        }
      };
    }
  };
}

module.exports = { createMovementsService };
