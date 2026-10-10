const { ConflictError, ForbiddenError, ValidationError } = require('../../shared/errors');
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
  function performMove(assetId, input, user, options = {}) {
    const asset = assetsRepository.findById(assetId);
    if (!asset) throw new ValidationError('Equipamento não encontrado.');
    authService.assertScope(user, asset);
    // Enquanto houver solicitação pendente, só a execução dela move o ativo.
    const reservation = movementsRepository.activeReservation(assetId);
    if (reservation && Number(options.approvedRequestId) !== reservation.request_id) {
      throw new ConflictError(`Ativo reservado pela solicitação #${reservation.request_id}.`);
    }

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
    if (rule.flow && options.flow !== rule.flow) {
      throw new ValidationError(
        'Esta etapa só ocorre pelo fluxo de desligamento: a devolução é marcada no início e encerrada pelo recebimento, com estado físico e acessórios.'
      );
    }
    authService.authorize(user, rule.permission);
    if (rule.requiresApproval && !options.approvedRequestId) {
      throw new ValidationError(
        'Esta transição exige uma solicitação aprovada. Use o módulo de aprovações.'
      );
    }

    if (toStatus === ASSET_STATES.IN_USE) {
      const employee = employeesRepository.findActiveById(employeeToId);
      if (!employee) throw new ValidationError('Funcionário ativo não encontrado.');
      authService.assertScope(user, employee);
    }

    if (openAssignment && toStatus !== ASSET_STATES.RETURN_PENDING) {
      assignmentsRepository.close(openAssignment.id);
    }
    if (toStatus === ASSET_STATES.IN_USE) {
      assignmentsRepository.create(assetId, employeeToId, user.id);
    }

    assetsRepository.updateStatus(
      assetId,
      toStatus,
      toStatus === ASSET_STATES.DEACTIVATED ? reason : null
    );
    const movementId = movementsRepository.create({
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
      movementId,
      previousStatus: asset.status,
      fromEmployeeId,
      toEmployeeId: toStatus === ASSET_STATES.IN_USE ? employeeToId : null
    };
  }

  return {
    performMove,
    normalizeState,
    listAssetHistory(assetId, user) {
      const scopes = authService.scopes(user);
      if (!assetsRepository.findById(assetId, scopes)) {
        if (scopes.length && assetsRepository.findById(assetId)) {
          throw new ForbiddenError('Seu alcance não permite acessar este registro.');
        }
        throw new ValidationError('Equipamento não encontrado.');
      }
      const showEmployees = authService.can(user, 'employee:read');
      return movementsRepository
        .listAssetHistory(assetId, scopes)
        .map((movement) =>
          showEmployees ? movement : { ...movement, employee_from: null, employee_to: null }
        );
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
