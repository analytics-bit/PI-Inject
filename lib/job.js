// Draait één demo-job: voert de generator uit, schrijft voortgang en bestanden naar de store.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runDemo } = require('./run');
const { launchBrowser, isServerless } = require('./browser');

const TYPES = { '.png': 'image/png', '.pdf': 'application/pdf', '.html': 'text/html; charset=utf-8', '.json': 'application/json' };
const MAX_LOG = 200;

async function runJob(store, { id, config }) {
  const startedAt = Date.now();
  const status = { id, state: 'running', name: config.name, url: config.url, startedAt, log: [], files: [] };
  // de instellingen van deze run, zodat je er later (via de lijst met eerdere demo's) mee kunt doorgaan
  status.input = {
    catalogUrl: config.catalogUrl || '', device: config.device || '', accentColor: config.accentColor || '',
    disable: ['popup', 'stickyBar', 'socialProof', 'carousel', 'loyalty', 'storyRow'].filter(k => config[k] === false),
  };
  const indexKey = `index/${String(startedAt).padStart(13, '0')}-${id}.json`;
  const index = state => store.putJson(indexKey, { id, name: config.name, url: config.url, startedAt, state });

  let lastWrite = 0, pending = null;
  const flush = async (force) => {
    const now = Date.now();
    if (!force && now - lastWrite < 600) return;
    lastWrite = now;
    await store.putJson(`jobs/${id}/status.json`, status);
  };
  const log = (...args) => {
    status.log.push(args.join(' ').replace(/\s+$/, ''));
    if (status.log.length > MAX_LOG) status.log.shift();
    pending = flush(false).catch(() => {});
  };

  await flush(true);
  await index('running');

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pim-job-'));
  try {
    await runDemo(config, { outDir, log, launchBrowser, dsf: isServerless() ? 1 : 2, twemoji: isServerless() });
    for (const name of fs.readdirSync(outDir)) {
      const ext = path.extname(name);
      if (!TYPES[ext]) continue;
      const data = fs.readFileSync(path.join(outDir, name));
      await store.putFile(`jobs/${id}/files/${name}`, data, TYPES[ext]);
      if (name !== 'persona.json') status.files.push({ name, size: data.length });
    }
    try {
      const p = JSON.parse(fs.readFileSync(path.join(outDir, 'persona.json'), 'utf8'));
      status.persona = p.generated ? { productType: p.generated.productType, ...p.generated.persona } : null;
      status.profiles = p.profiles; // per bezoekersprofiel: naam, wijzigingen, teksten (prefix = voorvoegsel van de bestanden)
      status.meta = p.meta; // accentkleur, palet en plaatsing van de carrousel
    } catch { /* geen persona.json */ }
    status.state = 'done';
  } catch (err) {
    status.state = 'error';
    const full = String((err && err.message) || err);
    status.error = full.split('\n')[0].slice(0, 300);
    // Playwright zet in het bericht een "call log" (waar het op wachtte): bewaar die voor diagnose
    status.log.push(`✗ ${status.error}`);
    for (const line of full.split('\n').slice(1, 12)) if (line.trim()) status.log.push(`   ${line.trim().slice(0, 200)}`);
  } finally {
    status.finishedAt = Date.now();
    try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {}
    await pending;
    await flush(true);
    await index(status.state);
  }
  return status;
}

module.exports = { runJob };
