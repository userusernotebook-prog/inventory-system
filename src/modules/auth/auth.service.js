const crypto = require('node:crypto');
const argon2 = require('argon2');
const { generateSecret, generateURI, verify } = require('otplib');
const { ForbiddenError, UnauthorizedError, ValidationError } = require('../../shared/errors');
const { pageResult } = require('../../shared/utils/query');
const { decryptTotpSecret, encryptTotpSecret } = require('./totp-crypto');

const SESSION_MS = 8 * 60 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const profiles = new Set(['ADMIN', 'TECNICO', 'RH', 'FINANCEIRO', 'CONSULTA']);
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

async function hasValidTotp(token, secret) {
  const result = await verify({ token, secret });
  return result.valid;
}

function createAuthService(repository, auditService) {
  function effectivePermissions(user) {
    const granted = new Set(repository.rolePermissions(user.profile_base));
    const overrides = repository.overrides(user.id);
    const denied = new Set(overrides.filter((x) => x.effect === 'deny').map((x) => x.permission));
    for (const row of overrides) if (row.effect === 'allow') granted.add(row.permission);
    for (const permission of denied) granted.delete(permission);
    return { granted: [...granted], denied: [...denied] };
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
    for (const scope of repository.scopes(user.id)) {
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
      !(await hasValidTotp(
        String(input.totp_code || ''),
        decryptTotpSecret(user.totp_secret, process.env.TOTP_ENCRYPTION_KEY)
      ))
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
    effectivePermissions(user) {
      if (!user) throw new ValidationError('Usuário não encontrado.');
      return effectivePermissions(user);
    },
    scopes(user) {
      return repository.scopes(user.id);
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
      repository.updateUser(id, { ...current, ...input });
      auditService.logUser(actor, 'update', 'user', id, {
        before: {
          name: current.name,
          email: current.email,
          profile_base: current.profile_base,
          active: current.active
        },
        after: input
      });
      return { ok: true };
    },
    async resetPassword(id, password, actor) {
      const user = repository.findById(id);
      if (!user) throw new ValidationError('Usuário não encontrado.');
      repository.resetPassword(id, await argon2.hash(password));
      repository.revokeSessions(id);
      auditService.logUser(actor, 'reset_password', 'user', id, {});
      return { ok: true };
    },
    async changePassword(user, password) {
      repository.changePassword(user.id, await argon2.hash(password));
      return { ok: true };
    },
    setupTotp(user) {
      const secret = generateSecret();
      repository.setTotp(user.id, encryptTotpSecret(secret, process.env.TOTP_ENCRYPTION_KEY), false);
      return { secret, uri: generateURI({ issuer: 'Inventário TI', label: user.email, secret }) };
    },
    async confirmTotp(user, code) {
      const fresh = repository.findById(user.id);
      if (
        !(await hasValidTotp(
          code,
          decryptTotpSecret(fresh.totp_secret, process.env.TOTP_ENCRYPTION_KEY)
        ))
      )
        throw new ValidationError('Código TOTP inválido.');
      repository.setTotp(user.id, fresh.totp_secret, true);
      return { ok: true };
    },
    logout(user) {
      repository.revokeSession(user.session_id);
      return { ok: true };
    },
    forceLogout(id, actor) {
      if (Number(id) === actor.id) {
        throw new ForbiddenError('Use sair para encerrar a própria sessão.');
      }
      if (!repository.findById(id)) throw new ValidationError('Usuário não encontrado.');
      repository.revokeSessions(id);
      auditService.logUser(actor, 'force_logout', 'user', id, {});
      return { ok: true };
    },
    setOverrides(id, rows, actor) {
      if (Number(id) === actor.id)
        throw new ForbiddenError('Você não pode alterar os próprios privilégios.');
      repository.setOverrides(id, rows);
      auditService.logUser(actor, 'permission_override', 'user', id, { after: rows });
      return { ok: true };
    },
    setScopes(id, rows, actor) {
      if (Number(id) === actor.id)
        throw new ForbiddenError('Você não pode alterar o próprio alcance.');
      repository.setScopes(id, rows);
      auditService.logUser(actor, 'scope', 'user', id, { after: rows });
      return { ok: true };
    },
    listUsers: (options) => pageResult({ ...options, ...repository.listUsers(options) }),
    findUser: (id) => repository.findById(id)
  };
}
module.exports = { createAuthService };
