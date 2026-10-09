const db = require('../src/db/connection');
const { employeeAnonymizationDays } = require('../src/config/env');

const cutoff = new Date(Date.now() - employeeAnonymizationDays * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);
const result = db
  .prepare(
    `UPDATE employees SET
      name='Funcionário anonimizado #' || id,
      email=NULL, corporate_phone=NULL, personal_phone=NULL,
      city=NULL, location=NULL, cost_center=NULL, code=NULL,
      updated_at=?
    WHERE status='desligado' AND offboarded_at IS NOT NULL AND offboarded_at<=?
      AND email IS NOT NULL`
  )
  .run(new Date().toISOString(), cutoff);

console.log(JSON.stringify({ event: 'offboarded_employees_anonymized', count: result.changes }));
db.close();
