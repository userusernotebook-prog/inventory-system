const argon2 = require('argon2');
const db = require('../src/db/connection');
const [, , email, password] = process.argv;
if (!email || !password || password.length < 12)
  throw new Error('Uso: npm run reset-admin -- email senha-com-12-caracteres');
const user = db
  .prepare("SELECT id FROM users WHERE profile_base='ADMIN' AND email=? COLLATE NOCASE")
  .get(email);
if (!user) throw new Error('Administrador não encontrado.');
(async () => {
  db.prepare(
    'UPDATE users SET password_hash=?,must_change_password=1,totp_secret=NULL,totp_enabled=0 WHERE id=?'
  ).run(await argon2.hash(password), user.id);
  db.prepare(
    'UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL'
  ).run(user.id);
  console.log('Senha redefinida. O próximo login exige troca de senha e configuração do 2FA.');
})()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
