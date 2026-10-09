const { createAuthRepository } = require('./auth.repository');

function ensureDefaultTechnicians(db) {
  const repository = createAuthRepository(db);
  if (repository.countTechnicians() === 0) repository.seedTechnicians();
}

module.exports = { ensureDefaultTechnicians };
