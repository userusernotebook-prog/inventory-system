const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ASSET_STATES,
  AssetStateTransitionError,
  TRANSITIONS,
  validateTransition
} = require('../src/modules/assets/domain/asset-state-machine');

function validInput(fromStatus, rule) {
  return {
    fromStatus,
    toStatus: rule.to,
    employeeFromId: 10,
    employeeToId: 20,
    reason: 'Registro técnico da movimentação',
    technicalReport: 'Laudo técnico aprovado pelo responsável.'
  };
}

test('a matriz aceita todas as transições declaradas e expõe sua política', () => {
  for (const [fromStatus, rules] of Object.entries(TRANSITIONS)) {
    for (const rule of rules) {
      const result = validateTransition(validInput(fromStatus, rule));
      assert.equal(result.to, rule.to, `${fromStatus} → ${rule.to}`);
      assert.equal(result.movementType, rule.movementType, `${fromStatus} → ${rule.to}`);
      assert.match(result.permission, /^asset:[a-z-]+$/);
      assert.equal(typeof result.requiresApproval, 'boolean');
    }
  }
});

test('a matriz rejeita todas as transições não declaradas', () => {
  const states = Object.values(ASSET_STATES);
  for (const fromStatus of states) {
    const allowedTargets = new Set(TRANSITIONS[fromStatus].map((rule) => rule.to));
    for (const toStatus of states) {
      if (allowedTargets.has(toStatus)) continue;
      assert.throws(
        () =>
          validateTransition({
            fromStatus,
            toStatus,
            employeeFromId: 10,
            employeeToId: 20,
            reason: 'Motivo',
            technicalReport: 'Laudo'
          }),
        AssetStateTransitionError,
        `${fromStatus} → ${toStatus}`
      );
    }
  }
});

test('a matriz exige cada campo obrigatório da transição', () => {
  for (const [fromStatus, rules] of Object.entries(TRANSITIONS)) {
    for (const rule of rules) {
      for (const field of rule.requiredFields) {
        const input = validInput(fromStatus, rule);
        input[field] = '';
        assert.throws(
          () => validateTransition(input),
          /exige (funcionário de destino|motivo|laudo técnico)/,
          `${fromStatus} → ${rule.to} sem ${field}`
        );
      }
    }
  }
});

test('transferência requer funcionário diferente e as transições críticas exigem aprovação', () => {
  assert.throws(
    () =>
      validateTransition({
        fromStatus: ASSET_STATES.IN_USE,
        toStatus: ASSET_STATES.IN_USE,
        employeeFromId: 10,
        employeeToId: 10
      }),
    /funcionário de destino diferente/
  );

  const approvalTransitions = Object.entries(TRANSITIONS).flatMap(([fromStatus, rules]) =>
    rules.filter((rule) => rule.requiresApproval).map((rule) => [fromStatus, rule.to])
  );
  assert.deepEqual(approvalTransitions, [
    [ASSET_STATES.AVAILABLE, ASSET_STATES.DEACTIVATED],
    [ASSET_STATES.IN_USE, ASSET_STATES.IN_USE],
    [ASSET_STATES.IN_USE, ASSET_STATES.DEACTIVATED],
    [ASSET_STATES.RETURN_PENDING, ASSET_STATES.DEACTIVATED],
    [ASSET_STATES.BACKUP, ASSET_STATES.IN_USE],
    [ASSET_STATES.BACKUP, ASSET_STATES.DEACTIVATED],
    [ASSET_STATES.UNDER_MAINTENANCE, ASSET_STATES.DEACTIVATED],
    [ASSET_STATES.UNDER_EVALUATION, ASSET_STATES.DEACTIVATED]
  ]);
});
