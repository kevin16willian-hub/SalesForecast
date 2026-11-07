const crypto = require('crypto');
const https = require('https');
const jwt = require('jsonwebtoken');
const sql = require('mssql');

const { authDb } = require('../db/sqlite');
const { getPool } = require('../db/mssql');
const { COOKIE_NAME, JWT_EXPIRES_IN, JWT_SECRET } = require('../middleware/requireAuth');
const { postJson } = require('../utils/http');

const OIDC_STATE_COOKIE = 'oidc_state';
const OIDC_NONCE_COOKIE = 'oidc_nonce';
const OIDC_VERIFIER_COOKIE = 'oidc_code_verifier';
const OIDC_TEST_EMAIL_COOKIE = 'oidc_test_email';
const OIDC_TEMP_MAX_AGE = 10 * 60 * 1000;
const SESSION_MAX_AGE = 8 * 60 * 60 * 1000;

const discoveryCache = new Map();

function getAzureClientId() {
  return String(process.env.AZURE_CLIENT_ID || process.env.APP_ID || '').trim();
}

function getAzureClientSecret() {
  return String(process.env.AZURE_CLIENT_SECRET || process.env.SECRET_KEY || '').trim();
}

function getAzureTenantId() {
  return String(process.env.AZURE_TENANT_ID || process.env.TENANT_ID || '').trim();
}

function getAppBaseUrl() {
  return String(process.env.APP_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
}

function getRedirectUri() {
  const override = String(process.env.APP_REDIRECT_URI || '').trim();
  if (override) return override.replace(/\/$/, '');
  return `${getAppBaseUrl()}/api/auth/callback/microsoft`;
}

function getFrontendOrigin() {
  const configured = String(process.env.FRONTEND_ORIGIN || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') return getAppBaseUrl();
  return 'http://localhost:5173';
}

function isSecureCookieContext() {
  return process.env.NODE_ENV === 'production' || /^https:/i.test(getAppBaseUrl()) || /^https:/i.test(getFrontendOrigin());
}

function getLogoutRedirectUri() {
  return getFrontendOrigin();
}

function getLoginRedirectUri() {
  return getFrontendOrigin();
}

function redirectLoginWithError(res, errorCode) {
  const loginUrl = new URL('/', getLoginRedirectUri());
  loginUrl.searchParams.set('auth_error', errorCode);
  return res.redirect(302, loginUrl.toString());
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function base64Url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function randomUrlSafe(size = 32) {
  return base64Url(crypto.randomBytes(size));
}

function sha256UrlSafe(value) {
  return base64Url(crypto.createHash('sha256').update(value).digest());
}

function requestJson(urlString, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlString);
      const payload = body == null ? null : (Buffer.isBuffer(body) ? body : Buffer.from(String(body)));
      const request = https.request({
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method,
        headers: {
          Accept: 'application/json',
          ...headers,
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      }, (response) => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed = text;
          try {
            parsed = text ? JSON.parse(text) : {};
          } catch {
            parsed = text;
          }
          resolve({ statusCode: response.statusCode || 0, headers: response.headers, body: parsed });
        });
      });

      request.on('error', reject);
      if (payload) request.write(payload);
      request.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function getDiscoveryDocument(tenantId) {
  const cacheKey = tenantId;
  if (!discoveryCache.has(cacheKey)) {
    discoveryCache.set(cacheKey, requestJson(
      `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`
    ).then(result => {
      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error('openid_configuration_error');
      }
      return result.body;
    }));
  }
  return discoveryCache.get(cacheKey);
}

function buildTempCookieOptions() {
  return {
    httpOnly: true,
    secure: isSecureCookieContext(),
    sameSite: 'lax',
    maxAge: OIDC_TEMP_MAX_AGE,
    path: '/api/auth',
  };
}

function buildSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: isSecureCookieContext(),
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  };
}

function clearTempCookies(res) {
  const tempOptions = { httpOnly: true, secure: isSecureCookieContext(), sameSite: 'lax', path: '/api/auth' };
  res.clearCookie(OIDC_STATE_COOKIE, tempOptions);
  res.clearCookie(OIDC_NONCE_COOKIE, tempOptions);
  res.clearCookie(OIDC_VERIFIER_COOKIE, tempOptions);
  res.clearCookie(OIDC_TEST_EMAIL_COOKIE, tempOptions);
}

function canUseDevLoginEmailOverride() {
  return process.env.NODE_ENV !== 'production' && String(process.env.ALLOW_LOGIN_EMAIL_OVERRIDE || '').trim().toLowerCase() === 'true';
}

function getDevLoginEmailOverride() {
  if (!canUseDevLoginEmailOverride()) return '';
  const value = normalizeEmail(process.env.EMAIL_TEST || '');
  if (!value) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return '';
  return value;
}

function nowIsoString() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '').substring(0, 23);
}

function normalizeLoginId(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw.includes('@') ? raw.split('@')[0] : raw;
}

function notifyLoginPA(upn) {
  const url = String(process.env.URL_PA_LOGIN || '').trim();
  if (!url) return;
  const ts = nowIsoString();
  const payload = {
    rpa_name:             '537 - SalesForecast',
    rpa_version:          '1.0.0',
    executed_by:          normalizeLoginId(upn),
    start_date:           ts,
    end_date:             ts,
    execution_status:     1,
    programming_language: 1,
  };
  postJson(url, payload).catch(err => {
    console.warn('[auth.microsoft] falha ao notificar login no PA:', err && err.message ? err.message : err);
  });
}

async function ensureAllowedEmail(email) {
  const db = await getPool();
  const result = await db.request()
    .input('Email', sql.NVarChar(255), email)
    .query('SELECT TOP 1 Unumber FROM BDISECC.mapping.SM_TDG_Pessoas WHERE Email = @Email');
  return !!(result.recordset && result.recordset.length);
}

function resolveRole(email) {
  try {
    const row = authDb.prepare('SELECT role FROM users WHERE email = ?').get(email);
    if (row && row.role) return String(row.role).trim().toLowerCase();
  } catch {}
  return 'user';
}

async function verifyIdToken({ idToken, nonce, clientId, issuer, jwksUri }) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('invalid_id_token');

  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  if (!header.kid) throw new Error('missing_kid');

  const jwksResult = await requestJson(jwksUri);
  if (jwksResult.statusCode < 200 || jwksResult.statusCode >= 300) {
    throw new Error('jwks_fetch_failed');
  }

  const jwk = Array.isArray(jwksResult.body && jwksResult.body.keys)
    ? jwksResult.body.keys.find(key => key.kid === header.kid)
    : null;

  if (!jwk) throw new Error('jwks_key_not_found');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const claims = jwt.verify(idToken, publicKey, {
    algorithms: ['RS256'],
    audience: clientId,
    issuer,
  });

  if (claims.nonce !== nonce) {
    throw new Error('invalid_nonce');
  }

  return claims;
}

async function loginMicrosoft(_req, res) {
  try {
    const tenantId = getAzureTenantId();
    const clientId = getAzureClientId();
    const clientSecret = getAzureClientSecret();

    if (!tenantId || !clientId || !clientSecret) {
      return res.status(500).json({ error: 'missing_oidc_env' });
    }

    const discovery = await getDiscoveryDocument(tenantId);
    const state = randomUrlSafe(24);
    const nonce = randomUrlSafe(24);
    const codeVerifier = randomUrlSafe(48);
    const codeChallenge = sha256UrlSafe(codeVerifier);

    const authorizationUrl = new URL(discovery.authorization_endpoint);
    authorizationUrl.searchParams.set('client_id', clientId);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('redirect_uri', getRedirectUri());
    authorizationUrl.searchParams.set('response_mode', 'query');
    authorizationUrl.searchParams.set('scope', 'openid profile email');
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('nonce', nonce);
    authorizationUrl.searchParams.set('code_challenge', codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');
    authorizationUrl.searchParams.set('prompt', 'select_account');

    const cookieOptions = buildTempCookieOptions();
    res.cookie(OIDC_STATE_COOKIE, state, cookieOptions);
    res.cookie(OIDC_NONCE_COOKIE, nonce, cookieOptions);
    res.cookie(OIDC_VERIFIER_COOKIE, codeVerifier, cookieOptions);

    const overrideEmail = getDevLoginEmailOverride();
    if (overrideEmail) {
      res.cookie(OIDC_TEST_EMAIL_COOKIE, overrideEmail, cookieOptions);
      console.log('[auth.microsoft] override de email de teste ativado:', overrideEmail);
    }

    return res.redirect(302, authorizationUrl.toString());
  } catch (err) {
    console.error('[GET /api/auth/login/microsoft]', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'server_error' });
  }
}

async function callbackMicrosoft(req, res) {
  const tenantId = getAzureTenantId();
  const clientId = getAzureClientId();
  const clientSecret = getAzureClientSecret();

  if (!tenantId || !clientId || !clientSecret) {
    return res.status(500).json({ error: 'missing_oidc_env' });
  }

  if (req.query && req.query.error) {
    const errorDescription = req.query.error_description || req.query.error;
    console.error('[GET /api/auth/callback/microsoft]', errorDescription);
    clearTempCookies(res);
    return res.status(401).send('Falha no login Microsoft.');
  }

  const code = req.query && req.query.code ? String(req.query.code) : '';
  const state = req.query && req.query.state ? String(req.query.state) : '';
  const expectedState = req.cookies[OIDC_STATE_COOKIE];
  const nonce = req.cookies[OIDC_NONCE_COOKIE];
  const codeVerifier = req.cookies[OIDC_VERIFIER_COOKIE];
  const testEmailOverride = normalizeEmail(req.cookies[OIDC_TEST_EMAIL_COOKIE] || '');

  if (!code || !state) {
    clearTempCookies(res);
    return res.status(400).send('Parâmetros inválidos no callback do Microsoft Entra ID.');
  }

  if (!expectedState || expectedState !== state || !nonce || !codeVerifier) {
    clearTempCookies(res);
    return res.status(400).send('Estado da autenticação inválido. Refaça o login.');
  }

  try {
    const discovery = await getDiscoveryDocument(tenantId);
    const tokenBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
      code_verifier: codeVerifier,
      scope: 'openid profile email',
    }).toString();

    const tokenResponse = await requestJson(discovery.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenBody,
    });

    if (tokenResponse.statusCode < 200 || tokenResponse.statusCode >= 300) {
      console.error('[GET /api/auth/callback/microsoft] token exchange failed', tokenResponse.body);
      clearTempCookies(res);
      return res.status(401).send('Não foi possível concluir a autenticação Microsoft.');
    }

    const idToken = tokenResponse.body && tokenResponse.body.id_token;
    if (!idToken) {
      clearTempCookies(res);
      return res.status(401).send('Resposta do Entra ID sem id_token.');
    }

    const claims = await verifyIdToken({
      idToken,
      nonce,
      clientId,
      issuer: discovery.issuer,
      jwksUri: discovery.jwks_uri,
    });

    const email = normalizeEmail(claims.email || claims.preferred_username || claims.upn || '');
    const name = String(claims.name || claims.given_name || email || '').trim();

    console.log('[auth.microsoft] email fornecido pelo login:', email || '(vazio)');

    const effectiveEmail = testEmailOverride || email;
    if (testEmailOverride) {
      console.log('[auth.microsoft] email de teste aplicado no login:', effectiveEmail);
    }

    if (!effectiveEmail) {
      clearTempCookies(res);
      return redirectLoginWithError(res, 'email_missing');
    }

    const allowed = await ensureAllowedEmail(effectiveEmail);
    if (!allowed) {
      clearTempCookies(res);
      return redirectLoginWithError(res, 'email_not_authorized');
    }

    try {
      const existingUser = authDb.prepare('SELECT email FROM users WHERE email = ?').get(effectiveEmail);
      if (!existingUser) {
        authDb.prepare("INSERT INTO users (email, role) VALUES (?, 'user')").run(effectiveEmail);
        console.log(`[auth.microsoft] novo usuário registrado em auth.db: ${effectiveEmail}`);
      }
    } catch (err) {
      console.warn('[auth.microsoft] falha ao registrar usuário em auth.db:', err && err.message ? err.message : err);
    }

    const role = resolveRole(effectiveEmail);
    const sessionToken = jwt.sign(
      {
        email: effectiveEmail,
        name,
        role,
        oid: claims.oid || null,
        sub: claims.sub || null,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.cookie(COOKIE_NAME, sessionToken, buildSessionCookieOptions());
    clearTempCookies(res);
    notifyLoginPA(String(
      claims.mailNickname ||
      claims.preferred_username ||
      claims.upn ||
      effectiveEmail
    ));
    return res.redirect(302, getLogoutRedirectUri());
  } catch (err) {
    console.error('[GET /api/auth/callback/microsoft]', err && err.message ? err.message : err);
    clearTempCookies(res);
    return res.status(500).send('Erro ao finalizar o login Microsoft.');
  }
}

function logout(req, res) {
  const cookieOptions = buildSessionCookieOptions();
  res.clearCookie(COOKIE_NAME, cookieOptions);
  clearTempCookies(res);

  if (req.method === 'POST') {
    return res.json({ ok: true });
  }

  const tenantId = getAzureTenantId();
  if (!tenantId) {
    return res.redirect(302, getLogoutRedirectUri());
  }

  const logoutUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/logout`);
  logoutUrl.searchParams.set('post_logout_redirect_uri', getLogoutRedirectUri());
  return res.redirect(302, logoutUrl.toString());
}

function me(req, res) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.json({ authenticated: false });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return res.json({
      authenticated: true,
      email: payload.email || '',
      name: payload.name || '',
      role: payload.role || 'user',
      oid: payload.oid || null,
      sub: payload.sub || null,
    });
  } catch {
    return res.json({ authenticated: false });
  }
}

module.exports = {
  loginMicrosoft,
  callbackMicrosoft,
  logout,
  me,
};