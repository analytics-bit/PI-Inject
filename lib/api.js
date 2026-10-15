// Platform-neutrale API-logica. Elk endpoint krijgt een store en een verzoek
// { method, headers, query, body } en geeft { status, headers, body } terug.
// Adapters: netlify/functions/* (Netlify) en app.js (lokaal / Render).
const { checkPassword, makeToken, isAuthed, sessionCookie } = require('./auth');
const { validateStart } = require('./validate');

const json = (status, obj, headers = {}) => ({
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }, body: JSON.stringify(obj),
});
const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;
const FILE_RE = /^[\w.-]+$/;

const deny = () => json(401, { error: 'Niet ingelogd' });

// Vereist JSON-verzoeken (blokkeert o.a. cross-site form-posts naast SameSite=Strict).
const isJson = req => String(req.headers['content-type'] || '').includes('application/json');

async function login(store, req, { secure } = {}) {
  if (req.method !== 'POST' || !isJson(req)) return json(405, { error: 'Alleen POST' });
  if (!process.env.APP_PASSWORD) return json(503, { error: 'APP_PASSWORD is niet ingesteld op de server' });
  if (!checkPassword(req.body && req.body.password)) {
    await new Promise(r => setTimeout(r, 600)); // rem op brute force
    return json(401, { error: 'Onjuist wachtwoord' });
  }
  return json(200, { ok: true }, { 'Set-Cookie': sessionCookie(makeToken(), secure) });
}

async function session(store, req) {
  const ok = isAuthed(req.headers);
  return json(ok ? 200 : 401, { ok });
}

// wait=true: wacht tot de job klaar is (Netlify background function); anders los laten lopen.
async function start(store, req, { wait = false } = {}) {
  if (req.method !== 'POST' || !isJson(req)) return json(405, { error: 'Alleen POST' });
  if (!isAuthed(req.headers)) return deny();
  let parsed;
  try { parsed = validateStart(req.body); } catch (err) {
    const id = req.body && ID_RE.test(req.body.id || '') ? req.body.id : null;
    if (id) await store.putJson(`jobs/${id}/status.json`, { id, state: 'error', error: err.message, log: [`✗ ${err.message}`], files: [], startedAt: Date.now() });
    return json(400, { error: err.message });
  }
  const { runJob } = require('./job'); // pas hier laden: zware generator-code niet voor elke endpoint
  const job = runJob(store, parsed);
  if (wait) await job; else job.catch(() => {});
  return json(202, { id: parsed.id });
}

async function status(store, req) {
  if (!isAuthed(req.headers)) return deny();
  const id = req.query.id;
  if (!ID_RE.test(id || '')) return json(400, { error: 'Ongeldig id' });
  const s = await store.getJson(`jobs/${id}/status.json`);
  return s ? json(200, s) : json(404, { error: 'Nog niet gestart' });
}

async function file(store, req) {
  if (!isAuthed(req.headers)) return deny();
  const { id, name } = req.query;
  if (!ID_RE.test(id || '') || !FILE_RE.test(name || '')) return json(400, { error: 'Ongeldig verzoek' });
  const f = await store.getFile(`jobs/${id}/files/${name}`);
  if (!f) return json(404, { error: 'Bestand niet gevonden' });
  const headers = { 'Content-Type': f.contentType, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' };
  if (req.query.download) headers['Content-Disposition'] = `attachment; filename="${name}"`;
  // onepager.html bevat uitgelezen sitegegevens: nooit scripts laten draaien
  if (name.endsWith('.html')) headers['Content-Security-Policy'] = "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'";
  return { status: 200, headers, body: f.data };
}

async function list(store, req) {
  if (!isAuthed(req.headers)) return deny();
  const keys = (await store.list('index/')).sort().reverse().slice(0, 30);
  const items = (await Promise.all(keys.map(k => store.getJson(k)))).filter(Boolean);
  return json(200, { items });
}

module.exports = { login, session, start, status, file, list };
