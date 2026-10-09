const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { migrate } = require('./migrate');
const { ensureDefaultTechnicians } = require('../modules/auth/auth.service');

const dataDir = path.resolve(__dirname, '..', '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'inventory.db'));

try {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  ensureDefaultTechnicians(db);
} catch (error) {
  db.close();
  throw error;
}

module.exports = db;
