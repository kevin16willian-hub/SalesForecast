const cors = require('cors');

const ALLOWED_ORIGIN = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');

// Em produção valida a origin exata; em dev aceita qualquer localhost/127.0.0.1
const corsOriginFn = (origin, callback) => {
  if (!origin) return callback(null, true); // curl, Postman, etc.
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    if (origin === ALLOWED_ORIGIN) return callback(null, true);
    console.warn(`[CORS] bloqueado — origin recebida: "${origin}" | ALLOWED_ORIGIN: "${ALLOWED_ORIGIN}"`);
    return callback(new Error('CORS bloqueado'));
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return callback(null, true);
  }
  console.warn(`[CORS] bloqueado (dev) — origin recebida: "${origin}"`);
  callback(new Error('CORS bloqueado'));
};

const corsMiddleware = cors({ origin: corsOriginFn, credentials: true });

module.exports = { corsMiddleware, ALLOWED_ORIGIN };
