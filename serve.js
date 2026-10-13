// Mini statische server voor lokale preview van mockup-tool.html
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const MIME = { '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.js': 'text/javascript', '.css': 'text/css', '.pdf': 'application/pdf' };
http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let p = path.join(ROOT, urlPath === '/' ? 'mockup-tool.html' : urlPath);
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(8461, () => console.log('mockup-tool op http://localhost:8461'));
