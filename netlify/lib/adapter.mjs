// Koppelt de platform-neutrale API (lib/api.js) aan Netlify Functions + Netlify Blobs.
import { getStore } from '@netlify/blobs';
import api from '../../lib/api.js';

function blobsStore() {
  const s = getStore({ name: 'pim-demos', consistency: 'strong' });
  return {
    async putJson(key, obj) { await s.setJSON(key, obj); },
    async putFile(key, buf, contentType) { await s.set(key, buf, { metadata: { contentType } }); },
    async getJson(key) { return s.get(key, { type: 'json' }); },
    async getFile(key) {
      const r = await s.getWithMetadata(key, { type: 'arrayBuffer' });
      return r ? { data: Buffer.from(r.data), contentType: (r.metadata && r.metadata.contentType) || 'application/octet-stream' } : null;
    },
    async list(prefix) { const { blobs } = await s.list({ prefix }); return blobs.map(b => b.key); },
  };
}

// handler: een functie uit lib/api.js; opts.wait = wachten tot de job klaar is (background function)
export function netlifyHandler(name, opts = {}) {
  return async (request) => {
    const url = new URL(request.url);
    const headers = Object.fromEntries(request.headers);
    let body = null;
    if (request.method === 'POST') {
      try { body = JSON.parse((await request.text()) || 'null'); } catch { body = null; }
    }
    const secure = url.protocol === 'https:' || headers['x-forwarded-proto'] === 'https';
    const r = await api[name](blobsStore(), { method: request.method, headers, query: Object.fromEntries(url.searchParams), body }, { secure, ...opts });
    return new Response(r.body, { status: r.status, headers: r.headers });
  };
}
