const https = require('https');

// Realiza um POST JSON via HTTPS nativo (sem dependências externas)
function postJson(urlString, data) {
  return new Promise((resolve, reject) => {
    try {
      const url  = new URL(urlString);
      const body = JSON.stringify(data);
      const opts = {
        hostname: url.hostname,
        port:     url.port || (url.protocol === 'https:' ? 443 : 80),
        path:     url.pathname + url.search,
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = https.request(opts, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          let parsed;
          try { parsed = JSON.parse(text); } catch { parsed = text; }
          resolve({ statusCode: res.statusCode, body: parsed });
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { postJson };
