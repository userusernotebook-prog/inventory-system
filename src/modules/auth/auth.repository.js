function createAuthRepository(db) {
  return {
    countTechnicians() {
      return db.prepare('SELECT COUNT(*) c FROM technicians').get().c;
    },
    seedTechnicians() {
      db.prepare("INSERT INTO technicians(name, role) VALUES (?, 'admin'), (?, 'technician')").run(
        'Administrador',
        'Técnico 1'
      );
    },
    findActiveById(id) {
      return db.prepare('SELECT * FROM technicians WHERE id=? AND active=1').get(id);
    },
    listActive() {
      return db.prepare('SELECT id,name,role FROM technicians WHERE active=1 ORDER BY name').all();
    },
    create(name, role) {
      return db.prepare('INSERT INTO technicians(name,role) VALUES(?,?)').run(name, role)
        .lastInsertRowid;
    }
  };
}

module.exports = { createAuthRepository };
