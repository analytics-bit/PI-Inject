// Bestandssysteem-store voor lokaal draaien (zelfde interface als de Netlify Blobs-store).
const fs = require('fs');
const path = require('path');

const TYPES = { '.png': 'image/png', '.pdf': 'application/pdf', '.html': 'text/html; charset=utf-8', '.json': 'application/json' };

function fsStore(root) {
  const base = path.resolve(root);
  const p = key => {
    const full = path.resolve(base, key);
    if (!full.startsWith(base)) throw new Error('ongeldige key');
    return full;
  };
  return {
    async putJson(key, obj) { fs.mkdirSync(path.dirname(p(key)), { recursive: true }); fs.writeFileSync(p(key), JSON.stringify(obj)); },
    async putFile(key, buf) { fs.mkdirSync(path.dirname(p(key)), { recursive: true }); fs.writeFileSync(p(key), buf); },
    async getJson(key) { try { return JSON.parse(fs.readFileSync(p(key), 'utf8')); } catch { return null; } },
    async getFile(key) {
      try { return { data: fs.readFileSync(p(key)), contentType: TYPES[path.extname(key)] || 'application/octet-stream' }; } catch { return null; }
    },
    async list(prefix) {
      const dir = p(prefix);
      if (!fs.existsSync(dir)) return [];
      const out = [];
      const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full); else out.push(path.relative(base, full).split(path.sep).join('/'));
      });
      walk(dir);
      return out;
    },
  };
}

module.exports = { fsStore };
