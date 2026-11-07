require('dotenv').config({ path: __dirname + '/../.env' });

const express      = require('express');
const cookieParser = require('cookie-parser');
const path         = require('path');

const { corsMiddleware, ALLOWED_ORIGIN } = require('./config/cors');
const requestLogger                      = require('./middleware/requestLogger');
const routes                             = require('./routes/index');

// ── Timestamp global para console.error / console.warn ───────────────────────
const _origError = console.error.bind(console);
const _origWarn  = console.warn.bind(console);
const _ts = () => {
  const d    = new Date();
  const ano  = d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const hora = d.toLocaleTimeString('it-IT', { hour12: false, timeZone: 'America/Sao_Paulo' });
  return `${ano}T${hora}`;
};
console.error = (...args) => _origError(_ts(), ...args);
console.warn  = (...args) => _origWarn(_ts(), ...args);

const app = express();

// ── Middlewares globais ──────────────────────────────────────────────────────
app.use(corsMiddleware);
app.use(express.json());
app.use(cookieParser());
app.use(requestLogger);

// ── Rotas da API ─────────────────────────────────────────────────────────────
app.use(routes);

// ── Static + SPA fallback ────────────────────────────────────────────────────
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

app.get('/*splat', (req, res, next) => {
  if (!req.originalUrl.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'));
  } else {
    next();
  }
});

// ── Inicializa servidor ──────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '4000', 10);

app.listen(PORT, () => {
  console.log(`[OK]  API rodando em http://localhost:${PORT}`);
  console.log(`[ENV] NODE_ENV      : ${process.env.NODE_ENV}`);
  console.log(`[ENV] ALLOWED_ORIGIN: ${ALLOWED_ORIGIN}`);
  console.log(`[ENV] DB_SERVER     : ${process.env.DB_SERVER}:${process.env.DB_PORT}`);
  console.log(`[ENV] DB_ENCRYPT    : ${process.env.DB_ENCRYPT}`);
});
