// Loga requests e responses com método, URL, status e duração
const _ts = () => {
  const d = new Date();
  // Ajusta para o fuso horário de São Paulo
  const ano = d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // 'sv-SE' dá o formato YYYY-MM-DD
  const hora = d.toLocaleTimeString('it-IT', { hour12: false, timeZone: 'America/Sao_Paulo' }); // HH:mm:ss
  return `${ano}T${hora}`;
};
function sanitizeUrlForLog(originalUrl) {
  try {
    const url = new URL(originalUrl, 'http://localhost');
    const sensitiveKeys = ['code', 'id_token', 'access_token', 'refresh_token', 'client_secret', 'assertion'];

    for (const key of sensitiveKeys) {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, '[redacted]');
      }
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return originalUrl;
  }
}

function requestLogger(req, res, next) {
  const start = Date.now();
  const safeUrl = sanitizeUrlForLog(req.originalUrl);
  console.log(`[${_ts()}] --> ${req.method} ${safeUrl}`);
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[${_ts()}] <-- ${req.method} ${safeUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
}

module.exports = requestLogger;
