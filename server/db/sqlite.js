const Database = require('better-sqlite3');
const path     = require('path');

// auth.db fica em server/auth.db
const authDb = new Database(path.join(__dirname, '..', 'auth.db'));

authDb.prepare(`CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE,
  role          TEXT DEFAULT 'user'
)`).run();

const userColumns = authDb.prepare('PRAGMA table_info(users)').all();
const hasPasswordHashColumn = userColumns.some(column => column.name === 'password_hash');
const hasRoleColumn = userColumns.some(column => column.name === 'role');

if (hasPasswordHashColumn) {
  try {
    authDb.prepare('BEGIN').run();
    authDb.prepare('ALTER TABLE users RENAME TO users_legacy').run();
    authDb.prepare(`CREATE TABLE users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT UNIQUE,
      role          TEXT DEFAULT 'user'
    )`).run();
    authDb.prepare(`
      INSERT INTO users (id, email, role)
      SELECT id, email, COALESCE(role, 'user')
      FROM users_legacy
    `).run();
    authDb.prepare('DROP TABLE users_legacy').run();
    authDb.prepare('COMMIT').run();
  } catch (err) {
    try { authDb.prepare('ROLLBACK').run(); } catch {}
    console.warn('[sqlite] Não foi possível remover a coluna password_hash de users:', err.message);
  }
} else if (!hasRoleColumn) {
  try {
    authDb.prepare("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'").run();
  } catch (err) {
    console.warn('[sqlite] Não foi possível criar a coluna role em users:', err.message);
  }
}

authDb.prepare(`CREATE TABLE IF NOT EXISTS registration_codes (
  email         TEXT PRIMARY KEY,
  code          TEXT,
  password_hash TEXT,
  expires_at    INTEGER
)`).run();

module.exports = { authDb };
