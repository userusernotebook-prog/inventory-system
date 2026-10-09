const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const src = path.join(__dirname, '..', 'data', 'inventory.db');
const dir = path.join(__dirname, '..', 'data', 'backups');
fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(src)) throw new Error('Banco ainda não existe. Inicie o sistema primeiro.');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(dir, `inventory-${stamp}.db`);

async function backup() {
  const db = new Database(src, { readonly: true, fileMustExist: true });
  try {
    // O backup do SQLite inclui alterações ainda presentes no arquivo WAL.
    await db.backup(dest);
    const copy = new Database(dest, { readonly: true, fileMustExist: true });
    try {
      if (copy.pragma('integrity_check', { simple: true }) !== 'ok') {
        throw new Error('A verificação de integridade do backup falhou.');
      }
    } finally {
      copy.close();
    }
    console.log(dest);
  } catch (error) {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    throw error;
  } finally {
    db.close();
  }
}

backup().catch((error) => {
  console.error('Não foi possível criar o backup:', error.message);
  process.exitCode = 1;
});
