const {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError
} = require('../../shared/errors');
const { ASSET_STATES } = require('../assets/domain/asset-state-machine');
const { pageResult } = require('../../shared/utils/query');

const TYPES = Object.freeze({
  EXCHANGE: 'TROCA_EQUIPAMENTO',
  BACKUP_USE: 'USO_EQUIPAMENTO_BACKUP',
  DEACTIVATION: 'DESATIVACAO_ATIVO'
});

function createApprovalsService(
  db,
  repository,
  assetsRepository,
  employeesRepository,
  movementsService,
  auditService,
  authService
) {
  function expireDueRequests() {
    for (const request of repository.expirePending()) {
      repository.markExpired(request.id);
      repository.release(request.id);
      repository.addEvent(request.id, 'EXPIRADA', null, {});
      repository.notify(
        request.requester_user_id,
        'approval_expired',
        'Solicitação expirada',
        'A solicitação expirou sem decisão.'
      );
    }
  }

  function getPending(id) {
    const request = repository.findById(id);
    if (!request) throw new NotFoundError('Solicitação não encontrada.');
    if (request.status !== 'PENDENTE')
      throw new ValidationError('A solicitação não está pendente.');
    if (request.expires_at <= new Date().toISOString()) {
      expireDueRequests();
      throw new ValidationError('A solicitação expirou.');
    }
    return request;
  }

  function requestAssets(input, user) {
    const employeeId = input.employee_id || null;
    if (input.type === TYPES.EXCHANGE) {
      if (!employeeId || !input.old_asset_id || !input.new_asset_id) {
        throw new ValidationError('Troca exige funcionário, ativo antigo e ativo novo.');
      }
      if (input.old_asset_id === input.new_asset_id) {
        throw new ValidationError('Os ativos da troca devem ser diferentes.');
      }
      return [
        { assetId: input.old_asset_id, role: 'OLD', expectedStatus: ASSET_STATES.IN_USE },
        { assetId: input.new_asset_id, role: 'NEW', expectedStatus: ASSET_STATES.BACKUP }
      ];
    }
    if (!input.asset_id) throw new ValidationError('Informe o ativo da solicitação.');
    if (input.type === TYPES.BACKUP_USE) {
      if (!employeeId) throw new ValidationError('Uso de backup exige um funcionário.');
      return [{ assetId: input.asset_id, role: 'PRIMARY', expectedStatus: ASSET_STATES.BACKUP }];
    }
    if (input.type === TYPES.DEACTIVATION) {
      if (!input.technical_report) throw new ValidationError('Desativação exige laudo técnico.');
      const asset = assetsRepository.findById(input.asset_id);
      if (!asset || asset.status === ASSET_STATES.DEACTIVATED)
        throw new ValidationError('Ativo não pode ser desativado.');
      authService.assertScope(user, asset);
      return [{ assetId: input.asset_id, role: 'PRIMARY', expectedStatus: asset.status }];
    }
    throw new ValidationError('Tipo de solicitação inválido.');
  }

  function assertAssetsAvailable(items, user) {
    for (const item of items) {
      const asset = assetsRepository.findById(item.assetId);
      if (!asset) throw new NotFoundError('Ativo não encontrado.');
      authService.assertScope(user, asset);
      if (asset.status !== item.expectedStatus) {
        throw new ValidationError('O ativo não está no estado exigido para esta solicitação.');
      }
      if (repository.reservationForAsset(item.assetId)) {
        throw new ConflictError('Este ativo já está reservado por outra solicitação pendente.');
      }
    }
  }

  function assertEmployee(employeeId, user, allowOffboarding = false) {
    if (!employeeId) return;
    const employee = employeesRepository.findById(employeeId);
    if (
      !employee ||
      (employee.status !== 'ativo' && !(allowOffboarding && employee.status === 'em_desligamento'))
    ) {
      throw new ValidationError('Funcionário ativo não encontrado.');
    }
    authService.assertScope(user, employee);
  }

  function execute(request, approver) {
    const items = repository.assets(request.id);
    for (const item of items) {
      if (item.current_status !== item.expected_status) {
        throw new ValidationError('O estado do ativo mudou desde a abertura da solicitação.');
      }
    }
    const byRole = Object.fromEntries(items.map((item) => [item.role, item]));
    const options = { approvedRequestId: request.id };
    const results = [];
    if (request.type === TYPES.EXCHANGE) {
      results.push(
        movementsService.performMove(
          byRole.OLD.asset_id,
          { toStatus: ASSET_STATES.UNDER_EVALUATION, reason: request.justification },
          approver,
          options
        )
      );
      results.push(
        movementsService.performMove(
          byRole.NEW.asset_id,
          {
            toStatus: ASSET_STATES.IN_USE,
            employeeToId: request.employee_id,
            reason: request.justification
          },
          approver,
          options
        )
      );
    } else if (request.type === TYPES.BACKUP_USE) {
      results.push(
        movementsService.performMove(
          byRole.PRIMARY.asset_id,
          {
            toStatus: ASSET_STATES.IN_USE,
            employeeToId: request.employee_id,
            reason: request.justification
          },
          approver,
          options
        )
      );
    } else {
      results.push(
        movementsService.performMove(
          byRole.PRIMARY.asset_id,
          {
            toStatus: ASSET_STATES.DEACTIVATED,
            reason: request.justification,
            technicalReport: request.technical_report
          },
          approver,
          options
        )
      );
    }
    return results;
  }

  return {
    create(input, user) {
      authService.authorize(user, 'request:create');
      const items = requestAssets(input, user);
      assertEmployee(input.employee_id, user, input.type === TYPES.DEACTIVATION);
      return db.transaction(() => {
        expireDueRequests();
        assertAssetsAvailable(items, user);
        const expiresAt = new Date(
          Date.now() + (input.expires_in_hours || 72) * 60 * 60 * 1000
        ).toISOString();
        const id = repository.createRequest({
          type: input.type,
          requesterUserId: user.id,
          employeeId: input.employee_id || null,
          justification: input.justification,
          technicalReport: input.technical_report || null,
          expiresAt
        });
        for (const item of items) {
          repository.addAsset(id, item.assetId, item.role, item.expectedStatus);
          repository.reserve(item.assetId, id);
        }
        repository.addAttachments(id, input.attachments || []);
        repository.addEvent(id, 'CRIADA', user.id, { type: input.type });
        auditService.logUser(user, 'approval_created', 'approval_request', id, {
          after: { type: input.type, assets: items.map((item) => item.assetId) }
        });
        return { id, status: 'PENDENTE', expires_at: expiresAt };
      })();
    },
    list(filters, user) {
      db.transaction(expireDueRequests)();
      const page = Number(filters.page) || 1;
      const pageSize = Number(filters.pageSize) || 25;
      const values = {
        status: filters.status,
        type: filters.type,
        requester_user_id: filters.requester_user_id
      };
      const result = repository.list(
        { ...values, page, pageSize },
        user.profile_base === 'ADMIN' ? null : user.id
      );
      return pageResult({ page, pageSize, ...result });
    },
    get(id, user) {
      db.transaction(expireDueRequests)();
      const detail = repository.details(id);
      if (!detail) throw new NotFoundError('Solicitação não encontrada.');
      if (detail.requester_user_id !== user.id && user.profile_base !== 'ADMIN')
        throw new ForbiddenError();
      return detail;
    },
    approve(id, approver) {
      authService.authorize(approver, 'request:approve');
      return db.transaction(() => {
        expireDueRequests();
        const request = getPending(id);
        const autoApproved = request.requester_user_id === approver.id;
        const results = execute(request, approver);
        repository.decide(id, 'APROVADA', approver.id, null);
        repository.markExecuted(id);
        repository.release(id);
        repository.addEvent(id, 'APROVADA', approver.id, { auto_approved: autoApproved });
        for (const result of results)
          repository.addEvent(id, 'EXECUTADA', approver.id, {}, result.movementId);
        repository.notify(
          request.requester_user_id,
          'approval_approved',
          'Solicitação aprovada',
          'Sua solicitação foi aprovada e executada.'
        );
        auditService.logUser(approver, 'approval_approved', 'approval_request', id, {
          after: { auto_approved: autoApproved }
        });
        return { ok: true, auto_approved: autoApproved };
      })();
    },
    reject(id, reason, approver) {
      authService.authorize(approver, 'request:approve');
      return db.transaction(() => {
        expireDueRequests();
        const request = getPending(id);
        if (request.requester_user_id === approver.id)
          throw new ForbiddenError('Você não pode rejeitar a própria solicitação.');
        repository.decide(id, 'REJEITADA', approver.id, reason);
        repository.release(id);
        repository.addEvent(id, 'REJEITADA', approver.id, { reason });
        repository.notify(
          request.requester_user_id,
          'approval_rejected',
          'Solicitação rejeitada',
          reason
        );
        auditService.logUser(approver, 'approval_rejected', 'approval_request', id, {
          after: { reason }
        });
        return { ok: true };
      })();
    },
    cancel(id, user) {
      return db.transaction(() => {
        expireDueRequests();
        const request = getPending(id);
        if (request.requester_user_id !== user.id)
          throw new ForbiddenError('Somente o solicitante pode cancelar.');
        repository.cancel(id);
        repository.release(id);
        repository.addEvent(id, 'CANCELADA', user.id, {});
        auditService.logUser(user, 'approval_cancelled', 'approval_request', id, {});
        return { ok: true };
      })();
    },
    pendingCount(user) {
      if (user.profile_base !== 'ADMIN') throw new ForbiddenError();
      db.transaction(expireDueRequests)();
      return repository.pendingCount();
    },
    notifications(user) {
      return repository.notifications(user.id);
    }
  };
}
module.exports = { createApprovalsService, TYPES };
