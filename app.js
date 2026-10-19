// Webapp als gewone Node-server: lokaal testen of hosten op Render/Railway/Docker.
// Op Netlify wordt dit bestand niet gebruikt — daar nemen netlify/functions/* de API over.
// Start: APP_PASSWORD=... node app.js   (poort via PORT, standaard 8462)
const http = require('http');
const fs = require('fs');
const path = require('path');
require('./lib/copy').loadDotEnv(); // .env laden (APP_PASSWORD, OPENROUTER_API_KEY)
const api = require('./lib/api');
const { fsStore } = require('./lib/store-fs');

const PUBLIC = path.join(__dirname, 'public');
const store = fsStore(process.env.DATA_DIR || path.join(__dirname, '.data'));
const PORT = process.env.PORT || 8462;
// Zonder APP_PASSWORD: geen login, maar dan alleen bereikbaar vanaf deze computer.
if (!process.env.APP_PASSWORD) process.env.AUTH_DISABLED = '1';
const HOST = process.env.AUTH_DISABLED === '1' ? '127.0.0.1' : '0.0.0.0';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const ROUTES = { login: api.login, session: api.session, start: api.start, status: api.status, file: api.file, list: api.list };

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > 100_000) { reject(new Error('te groot')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) {
      const handler = ROUTES[url.pathname.slice(5)];
      if (!handler) { res.writeHead(404); return res.end('not found'); }
      let body = null;
      if (req.method === 'POST') {
        try { body = JSON.parse((await readBody(req)) || 'null'); } catch { body = null; }
      }
      const secure = (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https';
      const r = await handler(store, { method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams), body }, { secure });
      res.writeHead(r.status, r.headers);
      return res.end(r.body);
    }
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname);
    const p = path.join(PUBLIC, rel);
    if (!p.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Serverfout' }));
  }
}).listen(PORT, HOST, () => {
  console.log(`PDP demo generator op http://localhost:${PORT}`);
  if (!process.env.APP_PASSWORD) console.log('Geen APP_PASSWORD: login staat uit, alleen bereikbaar op deze computer (127.0.0.1)');
});
