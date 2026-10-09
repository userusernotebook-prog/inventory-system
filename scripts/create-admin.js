const argon2 = require('argon2');
const db = require('../src/db/connection');
const [, , name, email, password] = process.argv;
if (!name || !email || !password || password.length < 12)
  throw new Error('Uso: npm run create-admin -- "Nome" email senha-com-12-caracteres');
if (db.prepare("SELECT 1 FROM users WHERE profile_base='ADMIN'").get())
  throw new Error('Já existe um administrador. Use reset-admin.');
(async () => {
  db.prepare(
    "INSERT INTO users(name,email,password_hash,profile_base,must_change_password) VALUES(?,?,?,'ADMIN',1)"
  ).run(name, email, await argon2.hash(password));
  console.log('Administrador criado. No primeiro login, troque a senha e configure o 2FA.');
})()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
