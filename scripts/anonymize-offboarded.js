function anonymizeOffboardedEmployees(db, retentionDays, now = new Date()) {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const result = db
    .prepare(
      `UPDATE employees SET
        name='Funcionário anonimizado #' || id,
        email=NULL, corporate_phone=NULL, personal_phone=NULL,
        city=NULL, location=NULL, cost_center=NULL, code=NULL,
        updated_at=?
      WHERE status='desligado' AND offboarded_at IS NOT NULL AND offboarded_at<=?`
    )
    .run(now.toISOString(), cutoff);
  return result.changes;
}

function main() {
  const db = require('../src/db/connection');
  const { employeeAnonymizationDays } = require('../src/config/env');
  const count = anonymizeOffboardedEmployees(db, employeeAnonymizationDays);
  console.log(JSON.stringify({ event: 'offboarded_employees_anonymized', count }));
  db.close();
}

if (require.main === module) main();

module.exports = { anonymizeOffboardedEmployees };
