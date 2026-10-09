const argon2 = require('argon2');
const { readPassword } = require('./admin-password');

function adminEmail(args, environment) {
  if (args.length > 1) throw new Error('A senha nao pode ser informada por argumento.');
  const email = args[0] || environment.ADMIN_EMAIL;
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('Informe o e-mail: npm run reset-admin -- email@empresa.com.');
  }
  return email.trim().toLowerCase();
}

async function resetAdmin(db, email, password) {
  const user = db
    .prepare("SELECT id FROM users WHERE profile_base='ADMIN' AND email=? COLLATE NOCASE")
    .get(email);
  if (!user) throw new Error('Administrador nao encontrado.');
  const now = new Date().toISOString();
  const passwordHash = await argon2.hash(password);
  db.transaction(() => {
    db.prepare(
      'UPDATE users SET password_hash=?,must_change_password=1,totp_secret=NULL,totp_enabled=0,failed_login_attempts=0,locked_until=NULL,updated_at=? WHERE id=?'
    ).run(passwordHash, now, user.id);
    db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(
      now,
      user.id
    );
  })();
}

async function main({ args = process.argv.slice(2), environment = process.env } = {}) {
  const email = adminEmail(args, environment);
  const password = await readPassword({ environment });
  const db = require('../src/db/connection');
  try {
    await resetAdmin(db, email, password);
    console.log('Senha redefinida. O proximo login exige troca de senha e configuracao do 2FA.');
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

module.exports = { adminEmail, main, resetAdmin };
