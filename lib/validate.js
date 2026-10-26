// Validatie van de invoer uit de webapp. Alles wat hier doorheen komt mag naar de generator.
const net = require('net');
const { sanitizeProfile, cleanPrompt } = require('./profiles');

const BLOCKS = {
  popup: ['headline', 'sub', 'cta', 'code'],
  stickyBar: ['text', 'cta'],
  socialProof: ['text', 'position'],
  loyalty: ['programName'],
  storyRow: [], // geen vrije tekst; alleen aan/uit (disable)
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
  if (b.device === 'mobile') config.device = 'mobile';
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
    // 'position' is een keuzelijst, geen vrije tekst
    if (out.position && !['below-cta', 'above-cta', 'below-title'].includes(out.position)) delete out.position;
    if (block === 'loyalty') { // getallen, geen vrije tekst
      const ppe = parseFloat(String(o.loyalty.pointsPerEuro).replace(',', '.'));
      if (Number.isFinite(ppe) && ppe >= 0.1 && ppe <= 50) out.pointsPerEuro = ppe;
      const cur = parseInt(o.loyalty.currentPoints, 10);
      if (Number.isFinite(cur) && cur >= 0 && cur <= 1000000) out.currentPoints = cur;
    }
    if (Object.keys(out).length) config[block] = out;
  }
  // Bezoekersprofielen: aantal, eigen namen (optioneel), of de (bewerkte) profielen van een eerdere run
  const pc = parseInt(b.profileCount, 10);
  if (pc >= 1 && pc <= 3) config.profileCount = pc;
  if (Array.isArray(b.profileHints)) {
    const hints = b.profileHints.map(h => cleanText(h, 80)).filter(Boolean).slice(0, 3);
    if (hints.length) config.profileHints = hints;
  }
  if (Array.isArray(b.profiles) && b.profiles.length) {
    const profiles = b.profiles.slice(0, 3).map(sanitizeProfile).filter(Boolean);
    if (profiles.length) config.profiles = profiles;
  }
  // Vrije instructies: bij de eerste generatie, en als aanpas-prompt op een bestaand resultaat (met het gesprek tot nu toe)
  const instructions = cleanPrompt(b.instructions, 800);
  if (instructions) config.instructions = instructions;
  const refine = cleanPrompt(b.refine, 600);
  if (refine) config.refine = refine;
  if (Array.isArray(b.chat)) {
    const chat = b.chat.slice(-8).map(c => ({ prompt: cleanPrompt(c && c.prompt, 600), summary: cleanPrompt(c && c.summary, 300) })).filter(c => c.prompt);
    if (chat.length) config.chat = chat;
  }
  if (b.persona && typeof b.persona === 'object') {
    const p = b.persona;
    config.persona = {
      name: cleanText(p.name || '', 60), description: cleanText(p.description || '', 240), productType: cleanText(p.productType || '', 80),
      motivations: (Array.isArray(p.motivations) ? p.motivations : []).map(x => cleanText(x, 120)).filter(Boolean).slice(0, 5),
      objections: (Array.isArray(p.objections) ? p.objections : []).map(x => cleanText(x, 120)).filter(Boolean).slice(0, 5),
    };
  }
  // Onderdelen die helemaal uit moeten (checkboxes in de webapp)
  if (Array.isArray(b.disable)) for (const k of b.disable) if (BLOCKS[k]) config[k] = false;
  return { id: b.id, config };
}

module.exports = { validateStart, BLOCKS };
