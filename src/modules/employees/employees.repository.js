function createEmployeesRepository(db) {
  return {
    list(query) {
      if (query) {
        return db
          .prepare(
            'SELECT * FROM employees WHERE name LIKE ? OR email LIKE ? OR department LIKE ? ORDER BY name LIMIT 100'
          )
          .all(`%${query}%`, `%${query}%`, `%${query}%`);
      }
      return db.prepare('SELECT * FROM employees ORDER BY created_at DESC LIMIT 300').all();
    },
    findById(id) {
      return db.prepare('SELECT * FROM employees WHERE id=?').get(id);
    },
    findActiveById(id) {
      return db.prepare("SELECT * FROM employees WHERE id=? AND status='ativo'").get(id);
    },
    findCodeDuplicate(code, id) {
      return db
        .prepare('SELECT id FROM employees WHERE code=? COLLATE NOCASE AND id<>?')
        .get(code, id);
    },
    create(input) {
      const result = db
        .prepare(
          `INSERT INTO employees
          (code,name,email,city,department,location,corporate_phone,personal_phone,status)
          VALUES(?,?,?,?,?,?,?,?,?)`
        )
        .run(
          input.code,
          input.name,
          input.email,
          input.city,
          input.department,
          input.location,
          input.corporate_phone,
          input.personal_phone,
          input.status
        );
      return result.lastInsertRowid;
    },
    update(id, input) {
      db.prepare(
        `UPDATE employees SET
          code=@code,name=@name,email=@email,department=@department,
          cost_center=@cost_center,city=@city,location=@location,
          corporate_phone=@corporate_phone,personal_phone=@personal_phone,
          hire_date=@hire_date,offboarded_at=@offboarded_at,
          updated_at=CURRENT_TIMESTAMP WHERE id=@id`
      ).run({ ...input, id });
    }
  };
}

module.exports = { createEmployeesRepository };
