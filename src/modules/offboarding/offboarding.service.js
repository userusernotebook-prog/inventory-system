const { NotFoundError, ValidationError } = require('../../shared/errors');
const { ASSET_STATES } = require('../assets/domain/asset-state-machine');

function createOffboardingService(
  db,
  repository,
  employeesRepository,
  assetsRepository,
  assignmentsRepository,
  movementsService,
  approvalsService,
  auditService,
  authService
) {
  function employeeForOffboarding(id, user) {
    const employee = employeesRepository.findById(id);
    if (!employee) throw new NotFoundError('Funcionário não encontrado.');
    authService.assertScope(user, employee);
    return employee;
  }

  return {
    start(id, input, user) {
      authService.authorize(user, 'employee:offboard');
      return db.transaction(() => {
        const employee = employeeForOffboarding(id, user);
        if (employee.status !== 'ativo') throw new ValidationError('O funcionário não está ativo.');
        const assets = repository.assignedAssets(employee.id);
        repository.start(employee.id, input.offboarding_date, input.reason);
        for (const asset of assets) {
          movementsService.performMove(
            asset.id,
            { toStatus: ASSET_STATES.RETURN_PENDING, reason: input.reason },
            user
          );
          repository.event(employee.id, 'ATIVO_PENDENTE_DEVOLUCAO', user.id, {
            asset_id: asset.id
          });
        }
        repository.event(employee.id, 'DESLIGAMENTO_INICIADO', user.id, {
          offboarding_date: input.offboarding_date,
          reason: input.reason,
          assets: assets.length
        });
        auditService.logUser(user, 'offboarding_started', 'employee', employee.id, {
          after: { status: 'em_desligamento' }
        });
        return { ok: true, pending_assets: assets.length };
      })();
    },
    receive(assetId, input, user) {
      authService.authorize(user, 'asset:receive');
      return db.transaction(() => {
        const assignment = assignmentsRepository.findOpenForAsset(assetId);
        if (!assignment)
          throw new ValidationError('O ativo não está atribuído a um funcionário em desligamento.');
        const employee = employeeForOffboarding(assignment.employee_id, user);
        if (employee.status !== 'em_desligamento')
          throw new ValidationError('O funcionário não está em desligamento.');
        const asset = assetsRepository.findById(assetId);
        if (!asset || asset.status !== ASSET_STATES.RETURN_PENDING)
          throw new ValidationError('O ativo não está pendente de devolução.');
        const result = movementsService.performMove(
          assetId,
          { toStatus: ASSET_STATES.UNDER_EVALUATION, reason: 'Recebimento no desligamento' },
          user
        );
        repository.addReceipt({
          assetId,
          employeeId: employee.id,
          userId: user.id,
          receivedAt: input.received_at || new Date().toISOString(),
          condition: input.physical_condition,
          accessories: input.accessories || null
        });
        repository.event(employee.id, 'ATIVO_RECEBIDO', user.id, {
          asset_id: Number(assetId),
          movement_id: Number(result.movementId)
        });
        auditService.logUser(user, 'offboarding_asset_received', 'asset', assetId, {
          after: { status: ASSET_STATES.UNDER_EVALUATION }
        });
        return { ok: true };
      })();
    },
    destination(assetId, input, user) {
      authService.authorize(user, 'asset:update');
      return db.transaction(() => {
        const receipt = repository.findReceipt(assetId);
        if (!receipt)
          throw new ValidationError('Registre o recebimento antes de definir o destino.');
        const employee = employeeForOffboarding(receipt.employee_id, user);
        if (employee.status !== 'em_desligamento')
          throw new ValidationError('O funcionário não está em desligamento.');
        const asset = assetsRepository.findById(assetId);
        if (!asset || asset.status !== ASSET_STATES.UNDER_EVALUATION)
          throw new ValidationError('O ativo não está em avaliação.');
        if (input.destination === ASSET_STATES.DEACTIVATED) {
          if (!input.technical_report)
            throw new ValidationError('Desativação exige laudo técnico.');
          const request = approvalsService.create(
            {
              type: 'DESATIVACAO_ATIVO',
              asset_id: Number(assetId),
              employee_id: employee.id,
              justification: input.justification,
              technical_report: input.technical_report
            },
            user
          );
          repository.event(employee.id, 'DESATIVACAO_SOLICITADA', user.id, {
            asset_id: Number(assetId),
            request_id: request.id
          });
          return { ok: true, approval_request_id: request.id };
        }
        const result = movementsService.performMove(
          assetId,
          { toStatus: input.destination, reason: input.justification },
          user
        );
        repository.event(employee.id, 'DESTINO_DEFINIDO', user.id, {
          asset_id: Number(assetId),
          destination: input.destination,
          movement_id: Number(result.movementId)
        });
        return { ok: true };
      })();
    },
    conclude(id, input, user) {
      authService.authorize(user, 'employee:offboard');
      return db.transaction(() => {
        const employee = employeeForOffboarding(id, user);
        if (employee.status !== 'em_desligamento')
          throw new ValidationError('O funcionário não está em desligamento.');
        if (repository.pendingDeactivation(employee.id))
          throw new ValidationError('Há uma solicitação de desativação pendente.');
        const checklist = repository.checklist(employee.id);
        const pending =
          (checklist[ASSET_STATES.RETURN_PENDING] || 0) +
          (checklist[ASSET_STATES.UNDER_EVALUATION] || 0);
        if (pending)
          throw new ValidationError('Ainda há ativos pendentes de recebimento ou avaliação.');
        const openTickets = repository.openTickets(employee.id);
        const actions = new Map(
          (input.ticket_actions || []).map((action) => [action.ticket_id, action])
        );
        if (
          openTickets.length !== actions.size ||
          openTickets.some((ticket) => !actions.has(ticket.id))
        ) {
          throw new ValidationError(
            'Todos os chamados abertos precisam ser fechados ou reatribuídos.'
          );
        }
        for (const ticket of openTickets) {
          const action = actions.get(ticket.id);
          if (action.action === 'FECHAR') repository.closeTicket(ticket.id);
          else {
            if (!action.employee_id || !employeesRepository.findActiveById(action.employee_id)) {
              throw new ValidationError('Informe um funcionário ativo para reatribuir o chamado.');
            }
            repository.reassignTicket(ticket.id, action.employee_id);
          }
        }
        repository.complete(employee.id);
        repository.event(employee.id, 'DESLIGAMENTO_CONCLUIDO', user.id, {
          offboarding_date: employee.offboarded_at
        });
        auditService.logUser(user, 'offboarding_completed', 'employee', employee.id, {
          after: { status: 'desligado' }
        });
        return { ok: true };
      })();
    },
    checklist(id, user) {
      authService.authorize(user, 'employee:offboard');
      const employee = employeeForOffboarding(id, user);
      const counts = repository.checklist(employee.id);
      return {
        employee: {
          id: employee.id,
          name: employee.name,
          status: employee.status,
          offboarding_date: employee.offboarded_at
        },
        pending: counts[ASSET_STATES.RETURN_PENDING] || 0,
        received: counts[ASSET_STATES.UNDER_EVALUATION] || 0,
        evaluated:
          (counts[ASSET_STATES.BACKUP] || 0) +
          (counts[ASSET_STATES.UNDER_MAINTENANCE] || 0) +
          (counts[ASSET_STATES.DEACTIVATED] || 0),
        open_tickets: repository.openTickets(employee.id).length,
        pending_deactivations: repository.pendingDeactivation(employee.id),
        assets: repository.checklistAssets(employee.id),
        events: repository.events(employee.id)
      };
    }
  };
}
module.exports = { createOffboardingService };
