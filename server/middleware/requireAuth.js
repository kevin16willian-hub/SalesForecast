const jwt    = require('jsonwebtoken');
const crypto = require('crypto');

const COOKIE_NAME    = 'auth_token';
const JWT_EXPIRES_IN = '8h';

// JWT_SECRET: defina JWT_SECRET no .env em produção.
// Em desenvolvimento uma chave aleatória é gerada por reinício (tokens invalidados).
const JWT_SECRET = process.env.JWT_SECRET || process.env.SECRET_KEY || (() => {
  const fallback = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  JWT_SECRET não definido em .env — tokens invalidados a cada reinício do servidor!');
  return fallback;
})();

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

module.exports = { COOKIE_NAME, JWT_EXPIRES_IN, JWT_SECRET, requireAuth };
