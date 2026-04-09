class UserRepository {
  /**
   * @param {import("better-sqlite3").Database} db
   */
  constructor(db) {
    this.db = db;
    this.insertStmt = db.prepare(
      `INSERT INTO users (email, password_hash) VALUES (?, ?)`
    );
    this.findByEmailStmt = db.prepare(
      `SELECT id, email, password_hash, created_at FROM users WHERE email = ?`
    );
    this.findByIdStmt = db.prepare(
      `SELECT id, email, created_at FROM users WHERE id = ?`
    );
  }

  create(email, passwordHash) {
    const info = this.insertStmt.run(email.trim().toLowerCase(), passwordHash);
    return { id: Number(info.lastInsertRowid), email: email.trim().toLowerCase() };
  }

  findByEmail(email) {
    return this.findByEmailStmt.get(email.trim().toLowerCase()) || null;
  }

  findById(id) {
    return this.findByIdStmt.get(id) || null;
  }
}

module.exports = { UserRepository };
