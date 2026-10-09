const Database = require('better-sqlite3');
const argon2 = require('argon2');
const request = require('supertest');
const { migrate } = require('../../src/db/migrate');
const { createApp } = require('../../src/app');

function createIntegrationContext() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);

  return {
    db,
    agent: request.agent(createApp(db)),
    close() {
      db.close();
    }
  };
}

async function createUser(db, values = {}) {
  const user = {
    name: 'Usuario de teste',
    email: 'usuario@example.test',
    password: 'SenhaDeTesteForte1',
    profile: 'CONSULTA',
    mustChangePassword: false,
    ...values
  };
  const passwordHash = await argon2.hash(user.password);
  const result = db
    .prepare(
      `INSERT INTO users(name, email, password_hash, profile_base, must_change_password)
       VALUES(?, ?, ?, ?, ?)`
    )
    .run(user.name, user.email, passwordHash, user.profile, Number(user.mustChangePassword));

  return { ...user, id: Number(result.lastInsertRowid) };
}

async function login(agent, email, password, totpCode) {
  const response = await agent
    .post('/api/auth/login')
    .send({ email, password, ...(totpCode ? { totp_code: totpCode } : {}) });
  return response;
}

module.exports = { createIntegrationContext, createUser, login };
