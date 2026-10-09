const { createAuthRepository } = require('./auth.repository');
const crypto = require('node:crypto');
const { UnauthorizedError, ValidationError } = require('../../shared/errors');
const { text } = require('../../shared/utils/text');

function ensureDefaultTechnicians(db) {
  const repository = createAuthRepository(db);
  if (repository.countTechnicians() === 0) repository.seedTechnicians();
}

function createAuthService(repository, adminPassword) {
  const adminTokens = new Map();
  return {
    listTechnicians: () => repository.listActive(),
    findActiveTechnician: (id) => (id ? repository.findActiveById(id) : null),
    hasValidToken(token) {
      const expiresAt = adminTokens.get(token);
      return Boolean(expiresAt && expiresAt >= Date.now());
    },
    login(password) {
      if (password !== adminPassword) throw new UnauthorizedError('Senha inválida.');
      const token = crypto.randomBytes(24).toString('hex');
      adminTokens.set(token, Date.now() + 8 * 60 * 60 * 1000);
      return { token };
    },
    createTechnician(input) {
      try {
        const id = repository.create(
          text(input.name),
          input.role === 'admin' ? 'admin' : 'technician'
        );
        return { id };
      } catch (error) {
        if (typeof error.code === 'string' && error.code.startsWith('SQLITE_CONSTRAINT')) {
          throw new ValidationError('Nome inválido ou já cadastrado.');
        }
        throw error;
      }
    }
  };
}

module.exports = { ensureDefaultTechnicians, createAuthService };
