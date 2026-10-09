const DATE_COLUMN = /(?:_at$|^created_at$|^updated_at$|^assigned_at$|^returned_at$|^revoked_at$|^opened_at$|^closed_at$|^offboarded_at$)/i;
const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function quote(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function findNonUtcTimestamps(db) {
  const failures = [];
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all();
  for (const { name: table } of tables) {
    const columns = db
      .pragma(`table_info(${quote(table)})`)
      .filter((column) => DATE_COLUMN.test(column.name));
    for (const { name: column } of columns) {
      const rows = db
        .prepare(`SELECT rowid AS id,${quote(column)} AS value FROM ${quote(table)} WHERE ${quote(column)} IS NOT NULL`)
        .all();
      for (const row of rows) {
        if (!UTC_ISO.test(String(row.value))) failures.push({ table, column, id: row.id, value: row.value });
      }
    }
  }
  return failures;
}

module.exports = { DATE_COLUMN, UTC_ISO, findNonUtcTimestamps };
