const argon2 = require('argon2');
const { readPassword } = require('./admin-password');

function adminIdentity(args, environment) {
  if (args.length > 2) throw new Error('A senha nao pode ser informada por argumento.');
  const [argumentName, argumentEmail] = args;
  const name = argumentName || environment.ADMIN_NAME;
  const email = argumentEmail || environment.ADMIN_EMAIL;
  if (!name || !email || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('Informe nome e e-mail: npm run create-admin -- "Nome" email.');
  }
  return { name: name.trim(), email: email.trim().toLowerCase() };
}

async function createAdmin(db, identity, password) {
  if (db.prepare("SELECT 1 FROM users WHERE profile_base='ADMIN'").get()) {
    throw new Error('Ja existe um administrador. Use reset-admin.');
  }
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO users(name,email,password_hash,profile_base,must_change_password,created_at,updated_at) VALUES(?,?,?,'ADMIN',1,?,?)"
  ).run(identity.name, identity.email, await argon2.hash(password), now, now);
}

async function main({ args = process.argv.slice(2), environment = process.env } = {}) {
  const identity = adminIdentity(args, environment);
  const password = await readPassword({ environment });
  const db = require('../src/db/connection');
  try {
    await createAdmin(db, identity, password);
    console.log('Administrador criado. No primeiro login, troque a senha e configure o 2FA.');
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { adminIdentity, createAdmin, main };
