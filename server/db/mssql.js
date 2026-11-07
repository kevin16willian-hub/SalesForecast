const sql = require('mssql');

const dbConfig = {
  server:   process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port:     parseInt(process.env.DB_PORT || '1433', 10),
  options: {
    encrypt:                true,   // SQL Server exige TLS — não alterar
    trustServerCertificate: true,
  },
  connectionTimeout: 30000,
  requestTimeout:    30000,
};

let pool;

async function getPool() {
  if (!pool) {
    pool = await sql.connect(dbConfig);
  }
  return pool;
}

module.exports = { sql, getPool };
