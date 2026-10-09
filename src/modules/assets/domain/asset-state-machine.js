const ASSET_STATES = Object.freeze({
  AVAILABLE: 'DISPONIVEL',
  IN_USE: 'EM_USO',
  RETURN_PENDING: 'PENDENTE_DEVOLUCAO',
  UNDER_EVALUATION: 'EM_AVALIACAO',
  BACKUP: 'BACKUP',
  UNDER_MAINTENANCE: 'EM_MANUTENCAO',
  DEACTIVATED: 'DESATIVADO'
});

const MOVEMENT_TYPES = Object.freeze({
  ASSIGNMENT: 'ATRIBUICAO',
  RETURN: 'DEVOLUCAO',
  TRANSFER: 'TRANSFERENCIA',
  SEND_TO_MAINTENANCE: 'ENVIO_MANUTENCAO',
  RETURN_FROM_MAINTENANCE: 'RETORNO_MANUTENCAO',
  SEND_TO_BACKUP: 'ENVIO_BACKUP',
  DEACTIVATION: 'DESATIVACAO',
  RETURN_PENDING: 'PENDENCIA_DEVOLUCAO',
  EVALUATION: 'AVALIACAO'
});

class AssetStateTransitionError extends Error {
  constructor(message, code = 'INVALID_ASSET_TRANSITION') {
    super(message);
    this.name = 'AssetStateTransitionError';
    this.code = code;
  }
}

function transition(to, movementType, permission, options = {}) {
  return Object.freeze({
    to,
    movementType,
    permission,
    requiredFields: Object.freeze(options.requiredFields || []),
    requiresApproval: Boolean(options.requiresApproval)
  });
}

const {
  AVAILABLE,
  IN_USE,
  RETURN_PENDING,
  UNDER_EVALUATION,
  BACKUP,
  UNDER_MAINTENANCE,
  DEACTIVATED
} = ASSET_STATES;
const {
  ASSIGNMENT,
  RETURN,
  TRANSFER,
  SEND_TO_MAINTENANCE,
  RETURN_FROM_MAINTENANCE,
  SEND_TO_BACKUP,
  DEACTIVATION,
  EVALUATION
} = MOVEMENT_TYPES;

const WITH_REASON = { requiredFields: ['reason'] };
const DEACTIVATION_RULE = {
  requiredFields: ['reason', 'technicalReport'],
  requiresApproval: true
};

const TRANSITIONS = Object.freeze({
  [AVAILABLE]: Object.freeze([
    transition(IN_USE, ASSIGNMENT, 'asset:assign', { requiredFields: ['employeeToId'] }),
    transition(BACKUP, SEND_TO_BACKUP, 'asset:send-backup'),
    transition(UNDER_MAINTENANCE, SEND_TO_MAINTENANCE, 'asset:send-maintenance', WITH_REASON),
    transition(UNDER_EVALUATION, EVALUATION, 'asset:evaluate', WITH_REASON),
    transition(DEACTIVATED, DEACTIVATION, 'asset:deactivate', DEACTIVATION_RULE)
  ]),
  [IN_USE]: Object.freeze([
    transition(IN_USE, TRANSFER, 'asset:transfer', {
      requiredFields: ['employeeToId'],
      requiresApproval: true
    }),
    transition(AVAILABLE, RETURN, 'asset:receive'),
    transition(RETURN_PENDING, MOVEMENT_TYPES.RETURN_PENDING, 'asset:mark-return-pending'),
    transition(BACKUP, SEND_TO_BACKUP, 'asset:send-backup'),
    transition(UNDER_MAINTENANCE, SEND_TO_MAINTENANCE, 'asset:send-maintenance', WITH_REASON),
    transition(UNDER_EVALUATION, EVALUATION, 'asset:evaluate', WITH_REASON),
    transition(DEACTIVATED, DEACTIVATION, 'asset:deactivate', DEACTIVATION_RULE)
  ]),
  [RETURN_PENDING]: Object.freeze([
    transition(IN_USE, ASSIGNMENT, 'asset:assign', { requiredFields: ['employeeToId'] }),
    transition(AVAILABLE, RETURN, 'asset:receive'),
    transition(BACKUP, SEND_TO_BACKUP, 'asset:send-backup'),
    transition(UNDER_MAINTENANCE, SEND_TO_MAINTENANCE, 'asset:send-maintenance', WITH_REASON),
    transition(UNDER_EVALUATION, EVALUATION, 'asset:evaluate', WITH_REASON),
    transition(DEACTIVATED, DEACTIVATION, 'asset:deactivate', DEACTIVATION_RULE)
  ]),
  [BACKUP]: Object.freeze([
    transition(IN_USE, ASSIGNMENT, 'asset:assign', {
      requiredFields: ['employeeToId'],
      requiresApproval: true
    }),
    transition(AVAILABLE, RETURN, 'asset:receive'),
    transition(UNDER_MAINTENANCE, SEND_TO_MAINTENANCE, 'asset:send-maintenance', WITH_REASON),
    transition(UNDER_EVALUATION, EVALUATION, 'asset:evaluate', WITH_REASON),
    transition(DEACTIVATED, DEACTIVATION, 'asset:deactivate', DEACTIVATION_RULE)
  ]),
  [UNDER_MAINTENANCE]: Object.freeze([
    transition(AVAILABLE, RETURN_FROM_MAINTENANCE, 'asset:return-maintenance'),
    transition(BACKUP, RETURN_FROM_MAINTENANCE, 'asset:return-maintenance'),
    transition(UNDER_EVALUATION, EVALUATION, 'asset:evaluate', WITH_REASON),
    transition(DEACTIVATED, DEACTIVATION, 'asset:deactivate', DEACTIVATION_RULE)
  ]),
  [UNDER_EVALUATION]: Object.freeze([
    transition(AVAILABLE, RETURN_FROM_MAINTENANCE, 'asset:return-evaluation'),
    transition(BACKUP, SEND_TO_BACKUP, 'asset:send-backup'),
    transition(UNDER_MAINTENANCE, SEND_TO_MAINTENANCE, 'asset:send-maintenance', WITH_REASON),
    transition(DEACTIVATED, DEACTIVATION, 'asset:deactivate', DEACTIVATION_RULE)
  ]),
  [DEACTIVATED]: Object.freeze([])
});

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function getTransition(fromStatus, toStatus) {
  if (!Object.values(ASSET_STATES).includes(fromStatus)) {
    throw new AssetStateTransitionError(`Estado de origem inválido: ${fromStatus}.`);
  }
  if (!Object.values(ASSET_STATES).includes(toStatus)) {
    throw new AssetStateTransitionError(`Estado de destino inválido: ${toStatus}.`);
  }
  if (fromStatus === DEACTIVATED) {
    throw new AssetStateTransitionError('Um ativo DESATIVADO não pode voltar a outro estado.');
  }
  const rule = TRANSITIONS[fromStatus].find((item) => item.to === toStatus);
  if (!rule) {
    throw new AssetStateTransitionError(`Transição não permitida: ${fromStatus} → ${toStatus}.`);
  }
  return rule;
}

function validateTransition(input) {
  const rule = getTransition(input.fromStatus, input.toStatus);
  const values = {
    employeeToId: input.employeeToId,
    reason: input.reason,
    technicalReport: input.technicalReport
  };
  for (const field of rule.requiredFields) {
    if (!hasValue(values[field])) {
      const labels = {
        employeeToId: 'funcionário de destino',
        reason: 'motivo',
        technicalReport: 'laudo técnico'
      };
      throw new AssetStateTransitionError(
        `A transição ${input.fromStatus} → ${input.toStatus} exige ${labels[field]}.`,
        'MISSING_TRANSITION_FIELD'
      );
    }
  }
  if (
    rule.movementType === TRANSFER &&
    Number(input.employeeFromId) === Number(input.employeeToId)
  ) {
    throw new AssetStateTransitionError(
      'A transferência exige um funcionário de destino diferente do funcionário de origem.',
      'INVALID_TRANSFER_DESTINATION'
    );
  }
  return rule;
}

module.exports = {
  ASSET_STATES,
  MOVEMENT_TYPES,
  TRANSITIONS,
  AssetStateTransitionError,
  getTransition,
  validateTransition
};
