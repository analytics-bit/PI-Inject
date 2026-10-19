// Gedeeld wachtwoord (env APP_PASSWORD) -> ondertekende sessiecookie.
// Zonder APP_PASSWORD wordt alles geweigerd (fail closed).
const crypto = require('crypto');

const COOKIE = 'pim_session';
const MAX_AGE_S = 60 * 60 * 12; // 12 uur

const secret = () => process.env.SESSION_SECRET || process.env.APP_PASSWORD || '';
const hmac = (data) => crypto.createHmac('sha256', secret()).update(data).digest('hex');
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();

function checkPassword(pw) {
  const expected = process.env.APP_PASSWORD;
  if (!expected || typeof pw !== 'string') return false;
  return crypto.timingSafeEqual(sha(pw), sha(expected));
}

function makeToken() {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE_S);
  return `${exp}.${hmac(exp)}`;
}

function verifyToken(token) {
  if (!secret() || typeof token !== 'string') return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const good = hmac(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}

function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// AUTH_DISABLED wordt alleen door app.js gezet (lokaal, zonder APP_PASSWORD, alleen bereikbaar op 127.0.0.1)
const isAuthed = (headers) => process.env.AUTH_DISABLED === '1' || verifyToken(readCookie(headers.cookie, COOKIE));

function sessionCookie(token, secure) {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${MAX_AGE_S}${secure ? '; Secure' : ''}`;
}

module.exports = { checkPassword, makeToken, isAuthed, sessionCookie, COOKIE };
