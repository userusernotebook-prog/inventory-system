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
    }
  };
}

module.exports = { createAuthRepository };
