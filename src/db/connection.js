const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { migrate } = require('./migrate');

const databasePath =
  process.env.DATABASE_PATH || path.resolve(__dirname, '..', '..', 'data', 'inventory.db');
const dataDir = path.dirname(databasePath);
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(databasePath);

try {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
} catch (error) {
  db.close();
  throw error;
}

module.exports = db;
