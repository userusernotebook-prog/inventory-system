const test = require('node:test');
const assert = require('node:assert/strict');
const { createIntegrationContext } = require('../helpers/integration-context');

test('audit_log e imutavel no banco', () => {
  const context = createIntegrationContext();
  try {
    const id = context.db
      .prepare("INSERT INTO audit_log(actor,action,entity_type,created_at) VALUES('teste','create','asset',?)")
      .run(new Date().toISOString()).lastInsertRowid;
    assert.throws(
      () => context.db.prepare('UPDATE audit_log SET action=? WHERE id=?').run('update', id),
      /imut/iu
    );
    assert.throws(() => context.db.prepare('DELETE FROM audit_log WHERE id=?').run(id), /imut/iu);
  } finally {
    context.close();
  }
});
