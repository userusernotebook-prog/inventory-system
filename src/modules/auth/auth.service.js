const crypto = require('node:crypto');
const argon2 = require('argon2');
const { generateSecret, generateURI, verify } = require('otplib');
const { ForbiddenError, UnauthorizedError, ValidationError } = require('../../shared/errors');
const { pageResult } = require('../../shared/utils/query');
const { decryptTotpSecret, encryptTotpSecret } = require('./totp-crypto');
const { resolveTotpEncryptionKey } = require('../../config/totp-key');
const { isAdminOnly, isKnownPermission } = require('./permissions');

const SESSION_MS = 8 * 60 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const profiles = new Set(['ADMIN', 'TECNICO', 'RH', 'FINANCEIRO', 'CONSULTA']);
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

async function hasValidTotp(token, secret) {
  const result = await verify({ token, secret });
  return result.valid;
}

// Segredos legados em texto puro ainda são lidos; só os cifrados exigem a chave.
function readTotpSecret(stored) {
  return stored && stored.startsWith('v1:')
    ? decryptTotpSecret(stored, resolveTotpEncryptionKey())
    : stored;
}

function createAuthService(repository, auditService) {
  // O admin sempre tem tudo: overrides e alcance gravados para ele são ignorados.
  // Para os demais, exclusivas do admin e coringas nunca entram, venham de onde vierem.
  function effectivePermissions(user) {
    if (user.profile_base === 'ADMIN') return { granted: ['*:*'], denied: [] };
    const grantable = (permission) => permission !== '*:*' && !isAdminOnly(permission);
    const granted = new Set(repository.rolePermissions(user.profile_base).filter(grantable));
    const overrides = repository.overrides(user.id);
    const denied = new Set(overrides.filter((x) => x.effect === 'deny').map((x) => x.permission));
    for (const row of overrides) {
      if (row.effect === 'allow' && isKnownPermission(row.permission) && grantable(row.permission))
        granted.add(row.permission);
    }
    for (const permission of denied) granted.delete(permission);
    return { granted: [...granted], denied: [...denied] };
  }
  function scopesOf(user) {
    return user.profile_base === 'ADMIN' ? [] : repository.scopes(user.id);
  }
  function assertNotOtherUsersAdmin(target, actor) {
    if (target.profile_base === 'ADMIN' && Number(target.id) !== Number(actor.id)) {
      throw new ForbiddenError('A conta do administrador só pode ser alterada por ele mesmo.');
    }
  }
  // Ninguém concede o que não possui; exclusivas do admin nunca são concedidas.
  function assertCanGrant(actor, permission) {
    if (isAdminOnly(permission)) {
      throw new ForbiddenError(
        `${permission} é exclusiva do administrador e não pode ser concedida.`
      );
    }
    if (!can(actor, permission)) {
      throw new ForbiddenError(`Você não pode conceder ${permission}, que não possui.`);
    }
  }
  function assertCanGrantProfile(actor, profileBase) {
    for (const permission of repository.rolePermissions(profileBase)) {
      if (!isAdminOnly(permission)) assertCanGrant(actor, permission);
    }
  }
  function can(user, permission) {
    const { granted, denied } = effectivePermissions(user);
    return (
      !denied.includes(permission) &&
      !denied.includes('*:*') &&
      (granted.includes('*:*') || granted.includes(permission))
    );
  }

  function isInScope(user, resource) {
    const valuesByType = new Map();
    for (const scope of scopesOf(user)) {
      const values = valuesByType.get(scope.scope_type) || [];
      values.push(String(scope.scope_value).trim().toLocaleLowerCase('pt-BR'));
      valuesByType.set(scope.scope_type, values);
    }
    const resourceValues = {
      city: resource.city,
      department: resource.department || resource.employee_department,
      equipment_type: resource.equipment_type
    };
    return [...valuesByType].every(([type, allowed]) => {
      const value = String(resourceValues[type] || '')
        .trim()
        .toLocaleLowerCase('pt-BR');
      return allowed.includes(value);
    });
  }
  async function login(input) {
    const user = repository.findByEmail(String(input.email || '').trim());
    const password = String(input.password || '');
    if (!user || !user.active) {
      await argon2.hash(password);
      throw new UnauthorizedError('E-mail ou senha inválidos.');
    }
    if (user.locked_until && user.locked_until > new Date().toISOString())
      throw new UnauthorizedError('Conta temporariamente bloqueada.');
    const valid =
      user.password_hash !== 'MIGRATION_REQUIRES_RESET' &&
      (await argon2.verify(user.password_hash, password));
    if (!valid) {
      const attempts = user.failed_login_attempts + 1;
      repository.failLogin(
        user.id,
        attempts,
        attempts >= 5 ? new Date(Date.now() + LOCK_MS).toISOString() : null
      );
      throw new UnauthorizedError('E-mail ou senha inválidos.');
    }
    if (
      user.totp_enabled &&
      !(await hasValidTotp(String(input.totp_code || ''), readTotpSecret(user.totp_secret)))
    )
      throw new UnauthorizedError('Código de autenticação inválido.');
    repository.updateLogin(user.id);
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
    repository.createSession(hashToken(token), user.id, expiresAt);
    return {
      token,
      expiresAt,
      mustChangePassword: Boolean(user.must_change_password),
      requiresTotpEnrollment: user.profile_base === 'ADMIN' && !user.totp_enabled
    };
  }
  return {
    async login(input) {
      return login(input);
    },
    authenticate(token) {
      return token ? repository.findSession(hashToken(token)) : null;
    },
    authorize(user, permission) {
      if (!user) throw new UnauthorizedError();
      if (!can(user, permission))
        throw new ForbiddenError('Você não tem permissão para esta operação.');
    },
    can(user, permission) {
      return Boolean(user) && can(user, permission);
    },
    effectivePermissions(user) {
      if (!user) throw new ValidationError('Usuário não encontrado.');
      return effectivePermissions(user);
    },
    scopes(user) {
      return scopesOf(user);
    },
    assertScope(user, resource) {
      if (!isInScope(user, resource)) {
        throw new ForbiddenError('Seu alcance não permite acessar este registro.');
      }
    },
    filterByScope(user, rows) {
      return rows.filter((row) => isInScope(user, row));
    },
    async createUser(input, actor) {
      if (!profiles.has(input.profileBase)) throw new ValidationError('Perfil inválido.');
      if (input.profileBase === 'ADMIN') {
        throw new ForbiddenError('O administrador só pode ser criado pelo comando create-admin.');
      }
      assertCanGrantProfile(actor, input.profileBase);
      const id = repository.createUser({
        name: input.name,
        email: input.email,
        passwordHash: await argon2.hash(input.password),
        profileBase: input.profileBase,
        active: true,
        mustChangePassword: true
      });
      auditService.logUser(actor, 'create', 'user', id, {
        after: { name: input.name, email: input.email, profile_base: input.profileBase }
      });
      return { id };
    },
    updateUser(id, input, actor) {
      const current = repository.findById(id);
      if (!current) throw new ValidationError('Usuário não encontrado.');
      assertNotOtherUsersAdmin(current, actor);
      if (
        current.profile_base === 'ADMIN' &&
        (input.profileBase !== 'ADMIN' || input.active === false)
      )
        throw new ForbiddenError('O administrador único não pode ser alterado nem desativado.');
      if (
        Number(id) === actor.id &&
        (input.profileBase !== current.profile_base || input.active === false)
      )
        throw new ForbiddenError('Você não pode alterar os próprios privilégios.');
      if (input.profileBase !== current.profile_base)
        assertCanGrantProfile(actor, input.profileBase);
      // R2: desativar ou trocar o perfil encerra as sessões na mesma transação.
      const revokeSessions =
        (Boolean(current.active) && input.active === false) ||
        input.profileBase !== current.profile_base;
      repository.transaction(() => {
        repository.updateUser(id, { ...current, ...input });
        if (revokeSessions) repository.revokeSessions(id);
        auditService.logUser(actor, 'update', 'user', id, {
          before: {
            name: current.name,
            email: current.email,
            profile_base: current.profile_base,
            active: current.active
          },
          after: input,
          reason: input.reason,
          sessions_revoked: revokeSessions
        });
      });
      return { ok: true };
    },
    async resetPassword(id, password, actor, reason) {
      const user = repository.findById(id);
      if (!user) throw new ValidationError('Usuário não encontrado.');
      assertNotOtherUsersAdmin(user, actor);
      const passwordHash = await argon2.hash(password);
      repository.transaction(() => {
        repository.resetPassword(id, passwordHash);
        repository.revokeSessions(id);
        auditService.logUser(actor, 'reset_password', 'user', id, { reason });
      });
      return { ok: true };
    },
    async changePassword(user, password) {
      repository.changePassword(user.id, await argon2.hash(password));
      return { ok: true };
    },
    setupTotp(user) {
      const secret = generateSecret();
      repository.setTotp(user.id, encryptTotpSecret(secret, resolveTotpEncryptionKey()), false);
      return { secret, uri: generateURI({ issuer: 'Inventário TI', label: user.email, secret }) };
    },
    async confirmTotp(user, code) {
      const fresh = repository.findById(user.id);
      if (!(await hasValidTotp(code, readTotpSecret(fresh.totp_secret))))
        throw new ValidationError('Código TOTP inválido.');
      repository.setTotp(user.id, fresh.totp_secret, true);
      return { ok: true };
    },
    logout(user) {
      repository.revokeSession(user.session_id);
      return { ok: true };
    },
    forceLogout(id, actor, reason) {
      if (Number(id) === actor.id) {
        throw new ForbiddenError('Use sair para encerrar a própria sessão.');
      }
      const target = repository.findById(id);
      if (!target) throw new ValidationError('Usuário não encontrado.');
      assertNotOtherUsersAdmin(target, actor);
      repository.transaction(() => {
        repository.revokeSessions(id);
        auditService.logUser(actor, 'force_logout', 'user', id, { reason });
      });
      return { ok: true };
    },
    // R2: permissões e alcance são lidos a cada requisição; alterá-los também
    // revoga as sessões, tudo na mesma transação (falha no meio desfaz tudo).
    setOverrides(id, rows, actor, reason) {
      if (Number(id) === actor.id)
        throw new ForbiddenError('Você não pode alterar os próprios privilégios.');
      const target = repository.findById(id);
      if (!target) throw new ValidationError('Usuário não encontrado.');
      if (target.profile_base === 'ADMIN') {
        throw new ForbiddenError('As permissões do administrador não podem ser alteradas.');
      }
      for (const row of rows) {
        if (!isKnownPermission(row.permission)) {
          throw new ValidationError(`Permissão desconhecida: ${row.permission}.`);
        }
        if (row.effect === 'allow') assertCanGrant(actor, row.permission);
      }
      repository.transaction(() => {
        repository.setOverrides(id, rows);
        repository.revokeSessions(id);
        auditService.logUser(actor, 'permission_override', 'user', id, { after: rows, reason });
      });
      return { ok: true };
    },
    setScopes(id, rows, actor, reason) {
      if (Number(id) === actor.id)
        throw new ForbiddenError('Você não pode alterar o próprio alcance.');
      const target = repository.findById(id);
      if (!target) throw new ValidationError('Usuário não encontrado.');
      if (target.profile_base === 'ADMIN') {
        throw new ForbiddenError('O alcance do administrador não pode ser restringido.');
      }
      repository.transaction(() => {
        repository.setScopes(id, rows);
        repository.revokeSessions(id);
        auditService.logUser(actor, 'scope', 'user', id, { after: rows, reason });
      });
      return { ok: true };
    },
    listUsers: (options) => pageResult({ ...options, ...repository.listUsers(options) }),
    findUser: (id) => repository.findById(id),
    userAdministration(id) {
      const user = repository.findById(id);
      if (!user) throw new ValidationError('UsuÃ¡rio nÃ£o encontrado.');
      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          profile_base: user.profile_base,
          active: Boolean(user.active),
          last_login_at: user.last_login_at,
          must_change_password: Boolean(user.must_change_password),
          totp_enabled: Boolean(user.totp_enabled)
        },
        profilePermissions: repository.rolePermissions(user.profile_base),
        overrides: repository.overrides(user.id),
        scopes: repository.scopes(user.id),
        effectivePermissions: effectivePermissions(user)
      };
    },
    scopeOptions: () => repository.scopeOptions()
  };
}
module.exports = { createAuthService };
