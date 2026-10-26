// Bezoekersprofielen via OpenRouter. De AI bepaalt het type shop/product, een doelpersona en
// 2-3 bezoekersprofielen ("nieuwe anonieme bezoeker", "koopjesjager", "loyale klant"...) en
// schrijft per profiel een eigen versie van de personalisaties, inclusief uitleg wat er anders is.
// Sleutel komt uit env OPENROUTER_API_KEY (of .env); model via OPENROUTER_MODEL.
const { loadDotEnv, chatJson } = require('./copy');

const BLOCK_KEYS = ['popup', 'stickyBar', 'socialProof', 'carousel', 'loyalty', 'storyRow'];

// Tekstvelden per onderdeel met maximale lengte (tekens)
const LIMITS = {
  popup: { headline: 50, sub: 130, cta: 28, code: 20 },
  stickyBar: { text: 80, cta: 16 },
  socialProof: { text: 60 },
  carousel: { title: 50 },
  loyalty: { programName: 28 },
};

// Teksten komen later via innerHTML op de pagina: tags en aanhalingstekens eruit.
const clean = (v, max) => {
  let t = String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/["“”<>]/g, '').replace(/\s+/g, ' ').trim();
  if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, '').trim();
  return t;
};
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);

function sanitizeProfile(raw, i) {
  if (!raw || typeof raw !== 'object') return null;
  const name = clean(raw.name, 60);
  if (!name) return null;
  const copy = {};
  for (const [block, fields] of Object.entries(LIMITS)) {
    const src = raw[block] || (raw.copy && raw.copy[block]);
    if (!src || typeof src !== 'object') continue;
    copy[block] = {};
    for (const [f, max] of Object.entries(fields)) {
      if (typeof src[f] !== 'string') continue;
      const t = clean(src[f], max);
      // een lege kortingscode is een bewuste keuze (aanbod zonder code); andere lege velden vallen terug op de standaard
      if (t || f === 'code') copy[block][f] = t;
    }
  }
  const pts = parseInt((raw.loyalty || (raw.copy && raw.copy.loyalty) || {}).currentPoints, 10);
  if (Number.isFinite(pts) && pts >= 0 && pts <= 20000) (copy.loyalty = copy.loyalty || {}).currentPoints = pts;
  const show = {};
  for (const k of BLOCK_KEYS) show[k] = !(raw.show && raw.show[k] === false);
  const changes = (Array.isArray(raw.changes) ? raw.changes : []).map(c => clean(c, 170)).filter(Boolean).slice(0, 6);
  return {
    key: slug(raw.key) || slug(name) || `profiel-${i + 1}`,
    name,
    description: clean(raw.description, 220),
    signals: clean(raw.signals, 150),
    changes,
    show,
    copy,
  };
}

function buildPrompt(brandName, facts, defaults, { count, hints }) {
  const hintText = hints && hints.length
    ? `Gebruik precies deze bezoekersprofielen (werk ze uit, verzin er geen bij): ${hints.map(h => `"${h}"`).join(', ')}.`
    : `Kies ${count === 1 ? 'één' : count} bezoekersprofielen die voor deze sector en dit product het meest logisch en het meest verschillend zijn. Denk aan: "Nieuwe anonieme bezoeker", "Bekende koopjesjager" (let op prijs en acties), "Vaste loyale klant die minder ontvankelijk is voor korting", "Twijfelaar die terugkomt zonder te kopen". Je mag eigen profielen bedenken als die beter passen. Geef ze korte, duidelijke Nederlandse namen.`;
  return `Je bent personalisatie-specialist voor PI Marketing (onsite campagnes voor webshops). Je maakt een sales-demo voor de webshop "${brandName}".

Productpagina-feiten (JSON):
${JSON.stringify(facts, null, 2)}

Taken:
1. Bepaal het type webshop/product (productType, kort) en een doelpersona die dit product waarschijnlijk koopt (persona).
2. ${hintText}
3. Maak per profiel een eigen versie van de personalisaties, afgestemd op wat dat profiel beweegt. Het eerste profiel is de basisversie.
4. Beschrijf per profiel in "changes" (3 tot 5 korte Nederlandse zinnen) WAT er voor dit profiel verandert en WAAROM, per onderdeel, bijvoorbeeld "Popup: vroege toegang tot de nieuwe collectie in plaats van korting, want loyale klanten reageren op exclusiviteit." Bij het basisprofiel leg je uit waarom deze aanpak past.

Onderdelen per profiel: popup, stickyBar (balk bovenaan), socialProof (korte zin onder de koopknop), carousel.title (titel boven aanbevolen producten), loyalty (spaarpuntenbalk voor leden) en show (welke onderdelen dit profiel wel/niet krijgt).

De popup-incentive:
- Bedenk een aanbod dat past bij het TYPE webshop en product én bij het profiel. Geen standaard "10% korting". Voorbeelden per sector: mode: vroege toegang tot de nieuwe collectie, gratis retour, persoonlijk stijladvies; beauty/drogisterij: gratis proefproduct, dubbele spaarpunten; wonen/tuin: inspiratiegids, cadeau bij bestelling; elektronica: extra garantie, gratis installatiehulp; sport/outdoor: vroege toegang tot nieuwe drops, gratis maatadvies; eten en drinken: proefpakket, cadeau bij eerste bestelling.
- Zet prijskortingen zuinig in: hooguit één profiel (bijvoorbeeld de koopjesjager) krijgt een korting als hoofdaanbod. De andere profielen krijgen een aanbod zonder prijskorting: vroege toegang, een cadeau, stijl- of productadvies, gratis retour of verzending (alleen als dat op de pagina staat), extra spaarpunten, een uitnodiging voor een besloten actie. Bij loyale klanten juist exclusiviteit, erkenning of vroege toegang.
- popup.code alleen invullen als het aanbod een kortingscode nodig heeft (bijv. "${defaults.popup.code}" als demo-code); anders een lege tekst "".

Verdere regels:
- Noem geen concrete aantallen spaarpunten in popup, sticky bar of social proof: de spaarpuntenbalk toont dat al, en de getallen moeten kloppen.
- Laat de profielen merkbaar verschillen: een andere insteek en andere woorden in popup, sticky bar, social proof en carrouseltitel. Herhaal niet dezelfde boodschap bij elk profiel. In "changes" noem je concreet wat er anders is dan bij het eerste profiel.
- Gebruik voor verzending, retour en levertijd ALLEEN wat in "shipping" of "excerpt" staat. Verzin geen voorwaarden of drempelbedragen. Staat er niets bruikbaars, schrijf dan over iets anders (gemak, pasvorm, kwaliteit).
- Social proof is een demo-placeholder: een plausibel, niet extreem getal dat past bij het product en het profiel. Voor een loyale klant kan het beter een ander soort bewijs zijn (bijv. "Populair bij leden").
- loyalty: laat show.loyalty op true voor herkenbare of ingelogde profielen (loyaal, terugkerend) met een realistische currentPoints (loyaal 1200 tot 3500, koopjesjager 300 tot 600), en op false voor een nieuwe anonieme bezoeker (niet ingelogd). loyalty.programName is de naam van een plausibel spaarprogramma, bijv. "${brandName} Members" of "${brandName} Club".
- Maximale lengtes: popup.headline 50 tekens, popup.sub 130, popup.cta 28, stickyBar.text 80 (mag 1 emoji aan het begin), stickyBar.cta 16, socialProof.text 60, carousel.title 50, loyalty.programName 28.
- Geen aanhalingstekens of HTML in de teksten.

Antwoord uitsluitend met JSON in dit formaat:
{"productType":"","persona":{"name":"","description":"","motivations":[""],"objections":[""]},"profiles":[{"key":"","name":"","description":"","signals":"hoe herken je dit profiel","changes":[""],"show":{"popup":true,"stickyBar":true,"socialProof":true,"carousel":true,"loyalty":false,"storyRow":true},"popup":{"headline":"","sub":"","cta":"","code":""},"stickyBar":{"text":"","cta":""},"socialProof":{"text":""},"carousel":{"title":""},"loyalty":{"programName":"","currentPoints":0}}]}`;
}

// opts: { count: 1-3, hints: [naam...] }. Retourneert { productType, persona, profiles } of null.
async function generateProfiles(brandName, facts, defaults, opts = {}, log = console.log) {
  loadDotEnv();
  if (!process.env.OPENROUTER_API_KEY) { log('  ⚠ OPENROUTER_API_KEY niet gezet — standaardversie gebruikt (geen profielen)'); return null; }
  const count = Math.min(Math.max(parseInt(opts.count, 10) || 3, 1), 3);
  const hints = (opts.hints || []).map(h => clean(h, 80)).filter(Boolean).slice(0, 3);
  try {
    const { data: raw, model } = await chatJson(buildPrompt(brandName, facts, defaults, { count: hints.length || count, hints }), { temperature: 0.8, timeoutMs: 90000, log });
    const profiles = (Array.isArray(raw.profiles) ? raw.profiles : []).map(sanitizeProfile).filter(Boolean).slice(0, hints.length || count);
    if (!profiles.length) throw new Error('geen bruikbare profielen in het antwoord');
    // unieke sleutels
    const seen = new Set();
    profiles.forEach((p, i) => { while (seen.has(p.key)) p.key = `${p.key}-${i + 1}`; seen.add(p.key); });
    const persona = raw.persona && typeof raw.persona === 'object' ? raw.persona : null;
    log(`  ↳ ${model}: ${clean(raw.productType, 80) || 'product'} | profielen: ${profiles.map(p => p.name).join(' · ')}`);
    return { productType: clean(raw.productType, 80), persona, profiles };
  } catch (err) {
    log(`  ⚠ profielen genereren mislukt (${err.message}) — standaardversie gebruikt`);
    return null;
  }
}

module.exports = { generateProfiles, sanitizeProfile, LIMITS, BLOCK_KEYS };
