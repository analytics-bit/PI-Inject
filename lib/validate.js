// Validatie van de invoer uit de webapp. Alles wat hier doorheen komt mag naar de generator.
const net = require('net');

const BLOCKS = {
  popup: ['headline', 'sub', 'cta', 'code'],
  stickyBar: ['text', 'cta'],
  socialProof: ['text'],
  carousel: ['title'],
};

// Geen interne adressen: de generator opent deze URL's server-side.
// (Geen DNS-check: een hostnaam die naar een intern IP wijst komt hier wel doorheen.)
function isBlockedHost(host) {
  if (process.env.ALLOW_PRIVATE_URLS === '1') return false;
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (net.isIPv4(h)) {
    const [a, b] = h.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (net.isIPv6(h)) return true;
  return false;
}

function cleanUrl(v, label) {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`${label} ontbreekt`);
  let u;
  try { u = new URL(v.trim()); } catch { throw new Error(`${label} is geen geldige URL`); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error(`${label} moet met http(s):// beginnen`);
  if (isBlockedHost(u.hostname)) throw new Error(`${label}: dit adres is niet toegestaan`);
  return u.toString();
}

// Teksten komen later via innerHTML op de pagina: tags en aanhalingstekens eruit.
const cleanText = (v, max) => String(v).replace(/<[^>]*>/g, '').replace(/[<>"]/g, '').trim().slice(0, max);

// Retourneert { id, config } of gooit een Error met een gebruikersvriendelijke melding.
function validateStart(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (typeof b.id !== 'string' || !/^[a-zA-Z0-9-]{8,64}$/.test(b.id)) throw new Error('Ongeldig job-id');
  const name = cleanText(b.name || '', 80);
  if (!name) throw new Error('Naam prospect ontbreekt');
  const config = { name, url: cleanUrl(b.url, 'PDP-URL') };
  if (b.catalogUrl && String(b.catalogUrl).trim()) config.catalogUrl = cleanUrl(b.catalogUrl, 'Categorie-URL');
  if (b.accentColor) {
    if (!/^#[0-9a-fA-F]{6}$/.test(b.accentColor)) throw new Error('Accentkleur moet een hex-kleur zijn (#rrggbb)');
    config.accentColor = b.accentColor;
  }
  if (b.autoCopy === false) config.autoCopy = false;
  const at = b.carouselAt;
  if (at && typeof at === 'object' && Number.isInteger(at.index) && at.index >= 0 && at.index < 200 && (at.position === 'before' || at.position === 'after')) {
    config.carouselAt = { index: at.index, position: at.position };
  }
  const o = b.overrides && typeof b.overrides === 'object' ? b.overrides : {};
  for (const [block, fields] of Object.entries(BLOCKS)) {
    if (o[block] === false) { config[block] = false; continue; }
    if (!o[block] || typeof o[block] !== 'object') continue;
    const out = {};
    for (const f of fields) if (typeof o[block][f] === 'string' && o[block][f].trim()) out[f] = cleanText(o[block][f], 200);
    if (Object.keys(out).length) config[block] = out;
  }
  return { id: b.id, config };
}

module.exports = { validateStart, BLOCKS };
