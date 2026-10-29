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

// Regels voor de AI die zowel bij het maken als bij het aanpassen van profielen gelden
function guidelines(brandName, defaults) {
  return `De popup-incentive:
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
- Geen aanhalingstekens of HTML in de teksten.`;
}

// Vrije tekst van de gebruiker: tags en stuurtekens eruit, lengte begrenzen. (Gaat alleen naar de AI en wordt als platte tekst getoond.)
const cleanPrompt = (v, max) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

function buildPrompt(brandName, facts, defaults, { count, hints, instructions }) {
  const hintText = hints && hints.length
    ? `Lever in totaal EXACT ${count} bezoekersprofielen in de lijst "profiles". Werk deze door de gebruiker gevraagde profielen uit: ${hints.map(h => `"${h}"`).join(', ')}.${hints.length < count ? ` Bedenk zelf de overige ${count - hints.length} profielen, zo dat ze duidelijk van elkaar en van de gevraagde profielen verschillen.` : ''}`
    : `Kies ${count === 1 ? 'één' : count} bezoekersprofielen die voor deze sector en dit product het meest logisch en het meest verschillend zijn. Denk aan: "Nieuwe anonieme bezoeker", "Bekende koopjesjager" (let op prijs en acties), "Vaste loyale klant die minder ontvankelijk is voor korting", "Twijfelaar die terugkomt zonder te kopen". Je mag eigen profielen bedenken als die beter passen. Geef ze korte, duidelijke Nederlandse namen.`;
  return `Je bent personalisatie-specialist voor PI Marketing (onsite campagnes voor webshops). Je maakt een sales-demo voor de webshop "${brandName}".

Productpagina-feiten (JSON):
${JSON.stringify(facts, null, 2)}
${instructions ? `
Extra instructies van de gebruiker (volg deze zo goed mogelijk; ze gaan boven je eigen voorkeuren, maar niet boven de regels verderop):
${instructions}
` : ''}
Taken:
1. Bepaal het type webshop/product (productType, kort) en een doelpersona die dit product waarschijnlijk koopt (persona).
2. ${hintText} Het aantal profielen in "profiles" moet exact ${count} zijn.
3. Maak per profiel een eigen versie van de personalisaties, afgestemd op wat dat profiel beweegt. Het eerste profiel is de basisversie.
4. Beschrijf per profiel in "changes" (3 tot 5 korte Nederlandse zinnen) WAT er voor dit profiel verandert en WAAROM, per onderdeel, bijvoorbeeld "Popup: vroege toegang tot de nieuwe collectie in plaats van korting, want loyale klanten reageren op exclusiviteit." Bij het basisprofiel leg je uit waarom deze aanpak past.

Onderdelen per profiel: popup, stickyBar (balk bovenaan), socialProof (korte zin onder de koopknop), carousel.title (titel boven aanbevolen producten), loyalty (spaarpuntenbalk voor leden) en show (welke onderdelen dit profiel wel/niet krijgt).

${guidelines(brandName, defaults)}

Antwoord uitsluitend met JSON in dit formaat:
{"productType":"","persona":{"name":"","description":"","motivations":[""],"objections":[""]},"profiles":[{"key":"","name":"","description":"","signals":"hoe herken je dit profiel","changes":[""],"show":{"popup":true,"stickyBar":true,"socialProof":true,"carousel":true,"loyalty":false,"storyRow":true},"popup":{"headline":"","sub":"","cta":"","code":""},"stickyBar":{"text":"","cta":""},"socialProof":{"text":""},"carousel":{"title":""},"loyalty":{"programName":"","currentPoints":0}}]}`;
}

// Vangnet: drie vaste profielen met neutrale teksten, voor als de AI niet (genoeg) profielen levert.
// Zo klopt het gekozen aantal altijd. De uitleg zegt eerlijk dat het standaardteksten zijn.
function fallbackProfiles(brandName, defaults) {
  const code = defaults.popup.code;
  const note = 'Standaardversie: de AI leverde dit profiel niet. Pas de teksten aan of genereer opnieuw.';
  return [
    {
      key: 'nieuwe-bezoeker', name: 'Nieuwe anonieme bezoeker', description: 'Een eerste bezoek, nog zonder aankoopgeschiedenis of account.', signals: 'Geen account, eerste sessie.',
      changes: ['Popup: welkomstaanbod om de eerste aankoop te stimuleren.', 'Spaarpunten: niet getoond, want deze bezoeker is niet ingelogd.', note],
      show: { loyalty: false },
      popup: { headline: `Welkom bij ${brandName}`, sub: 'Schrijf je in en ontvang 10% korting op je eerste bestelling.', cta: 'Ja, ik wil korting', code },
      stickyBar: { text: 'Snel in huis en gratis retour', cta: 'Shop nu' }, socialProof: { text: '23 anderen bekeken dit product vandaag' }, carousel: { title: 'Anderen bekeken ook' },
    },
    {
      key: 'koopjesjager', name: 'Bekende koopjesjager', description: 'Een terugkerende bezoeker die let op prijs en acties.', signals: 'Bekijkt vaak sale en kijkt kritisch naar prijzen.',
      changes: ['Popup: de nadruk op actuele voordelen in plaats van een welkomstkorting.', 'Social proof: laat zien dat het product veel gekocht wordt.', note],
      show: { loyalty: true },
      popup: { headline: 'Mis geen enkel voordeel', sub: 'Schrijf je in en ontvang als eerste onze beste aanbiedingen.', cta: 'Stuur me de acties', code: '' },
      stickyBar: { text: 'Slim kopen: bekijk de actuele aanbiedingen', cta: 'Bekijk' }, socialProof: { text: 'Dit product is deze week veel gekocht' }, carousel: { title: 'Populair en scherp geprijsd' },
      loyalty: { programName: `${brandName} Club`, currentPoints: 450 },
    },
    {
      key: 'vaste-klant', name: 'Vaste loyale klant', description: 'Een trouwe klant die minder gevoelig is voor korting en waarde hecht aan erkenning.', signals: 'Regelmatige aankopen, ingelogd, lid van het spaarprogramma.',
      changes: ['Popup: voorrang en exclusiviteit in plaats van korting.', 'Spaarpunten: getoond met een hoge stand om de relatie te erkennen.', note],
      show: { loyalty: true },
      popup: { headline: 'Exclusief voor vaste klanten', sub: 'Krijg als eerste toegang tot nieuwe producten voordat ze live gaan.', cta: 'Ja, geef me voorrang', code: '' },
      stickyBar: { text: 'Fijn dat je er weer bent', cta: 'Ontdek' }, socialProof: { text: 'Populair bij onze leden' }, carousel: { title: 'Aanbevolen voor jou' },
      loyalty: { programName: `${brandName} Members`, currentPoints: 2100 },
    },
  ].map((p, i) => sanitizeProfile(p, i));
}

// Vraagt de AI om extra profielen die verschillen van de bestaande (voor als er te weinig terugkwamen).
function buildTopUpPrompt(brandName, facts, defaults, { existing, missing, unmet, instructions }) {
  return `Je bent personalisatie-specialist voor PI Marketing. Je maakt een sales-demo voor de webshop "${brandName}".

Productpagina-feiten (JSON):
${JSON.stringify(facts, null, 2)}
${instructions ? `\nExtra instructies van de gebruiker (volg deze zo goed mogelijk):\n${instructions}\n` : ''}
Er zijn al deze bezoekersprofielen (niet opnieuw maken):
${JSON.stringify(existing.map(p => ({ name: p.name, description: p.description })), null, 2)}

Taak: bedenk nog precies ${missing} EXTRA bezoekersprofiel${missing === 1 ? '' : 'en'} dat duidelijk verschilt van de bestaande, met een eigen versie van de personalisaties en een uitleg in "changes" (3 tot 5 korte zinnen: wat verandert er en waarom).${unmet.length ? ` De gebruiker wil deze profielen: ${unmet.map(h => `"${h}"`).join(', ')}.` : ''}
Onderdelen per profiel: popup, stickyBar, socialProof, carousel.title, loyalty en show.

${guidelines(brandName, defaults)}

Antwoord uitsluitend met JSON in dit formaat:
{"profiles":[{"key":"","name":"","description":"","signals":"","changes":[""],"show":{"popup":true,"stickyBar":true,"socialProof":true,"carousel":true,"loyalty":false,"storyRow":true},"popup":{"headline":"","sub":"","cta":"","code":""},"stickyBar":{"text":"","cta":""},"socialProof":{"text":""},"carousel":{"title":""},"loyalty":{"programName":"","currentPoints":0}}]}`;
}

// opts: { count: 1-3, hints: [naam...], instructions }. Het gekozen aantal wordt gegarandeerd:
// eigen profielen (hints) tellen mee, ontbrekende profielen worden bij de AI aangevraagd en als dat niet lukt
// aangevuld met standaardprofielen. Retourneert { productType, persona, profiles } of null (alleen bij 1 profiel).
async function generateProfiles(brandName, facts, defaults, opts = {}, log = console.log) {
  loadDotEnv();
  const count = Math.min(Math.max(parseInt(opts.count, 10) || 3, 1), 3);
  const hints = (opts.hints || []).map(h => clean(h, 80)).filter(Boolean).slice(0, 3);
  const target = Math.min(3, Math.max(count, hints.length)); // eigen profielen verlagen het gekozen aantal nooit
  const instructions = cleanPrompt(opts.instructions, 800);
  const profiles = [];
  const names = new Set();
  const add = list => { for (const p of list) if (profiles.length < target && !names.has(p.name.toLowerCase())) { profiles.push(p); names.add(p.name.toLowerCase()); } };
  let productType = '', persona = null;

  if (!process.env.OPENROUTER_API_KEY) {
    log('  ⚠ OPENROUTER_API_KEY niet gezet: geen AI-teksten');
  } else {
    try {
      const { data: raw, model } = await chatJson(buildPrompt(brandName, facts, defaults, { count: target, hints, instructions }), { temperature: 0.8, timeoutMs: 90000, log });
      add((Array.isArray(raw.profiles) ? raw.profiles : []).map(sanitizeProfile).filter(Boolean));
      productType = clean(raw.productType, 80);
      persona = raw.persona && typeof raw.persona === 'object' ? raw.persona : null;
      log(`  ↳ ${model}: ${productType || 'product'} | profielen: ${profiles.map(p => p.name).join(' · ') || 'geen'}`);
    } catch (err) {
      log(`  ⚠ profielen genereren mislukt (${err.message})`);
    }
    // Te weinig profielen terug? Vraag de ontbrekende apart aan (maximaal twee keer).
    for (let attempt = 1; attempt <= 2 && profiles.length > 0 && profiles.length < target; attempt++) {
      const missing = target - profiles.length;
      const unmet = hints.filter(h => !profiles.some(p => p.name.toLowerCase().includes(h.toLowerCase().slice(0, 8))));
      log(`  ↻ ${profiles.length} van ${target} profielen ontvangen, ${missing} extra aanvragen`);
      try {
        const { data: raw } = await chatJson(buildTopUpPrompt(brandName, facts, defaults, { existing: profiles, missing, unmet, instructions }), { temperature: 0.8, timeoutMs: 90000, log });
        add((Array.isArray(raw.profiles) ? raw.profiles : []).map(sanitizeProfile).filter(Boolean));
      } catch (err) {
        log(`  ⚠ aanvullen mislukt (${err.message})`);
      }
    }
  }

  // Laatste vangnet: standaardprofielen, zodat het gekozen aantal altijd klopt (bij 1 profiel valt run.js terug op "Standaard")
  if (target > 1 && profiles.length < target) {
    const before = profiles.length;
    add(fallbackProfiles(brandName, defaults).filter(f => !profiles.some(p => p.key === f.key)));
    log(`  ⚠ ${before} van ${target} profielen via de AI; ${profiles.length - before} aangevuld met standaardprofielen`);
  }
  if (!profiles.length) return null;

  const seen = new Set();
  profiles.forEach((p, i) => { while (seen.has(p.key)) p.key = `${p.key}-${i + 1}`; seen.add(p.key); });
  return { productType, persona, profiles };
}

// Een profiel (zoals in de webapp bewaard) terug naar het platte formaat waarin de AI antwoordt
function flatProfile(p) {
  const out = { key: p.key, name: p.name, description: p.description, signals: p.signals, changes: p.changes, show: p.show };
  for (const [block, v] of Object.entries(p.copy || {})) if (v && typeof v === 'object') out[block] = v;
  return out;
}

function buildRefinePrompt(brandName, facts, defaults, { profiles, instruction, brief, chat }) {
  const compactFacts = { title: facts.title, brand: facts.brand, price: facts.price, description: facts.description, breadcrumbs: facts.breadcrumbs, shipping: facts.shipping };
  const earlier = (chat || []).map((c, i) => `${i + 1}. "${c.prompt}"${c.summary ? ` (gedaan: ${c.summary})` : ''}`).join('\n');
  return `Je bent personalisatie-specialist voor PI Marketing. Je past een bestaande sales-demo aan voor de webshop "${brandName}" op basis van een instructie van de gebruiker.

Productpagina-feiten (JSON):
${JSON.stringify(compactFacts, null, 2)}
${brief ? `\nOorspronkelijke instructies van de gebruiker (blijven gelden):\n${brief}\n` : ''}${earlier ? `\nEerdere aanpassingen in dit gesprek:\n${earlier}\n` : ''}
Huidige bezoekersprofielen met hun personalisaties (JSON):
${JSON.stringify(profiles.map(flatProfile), null, 2)}

Nieuwe instructie van de gebruiker:
${instruction}

Taak:
- Pas de profielen aan zoals de instructie vraagt. Wijzig ALLEEN wat de instructie raakt en laat al het andere letterlijk ongewijzigd (ook de teksten die al goed zijn).
- Je mag een profiel toevoegen, vervangen of weghalen als de instructie dat vraagt; er zijn maximaal 3 profielen. Behoud de "key" van bestaande profielen die blijven bestaan, en de volgorde.
- Werk "changes" bij zodat die kloppen met de nieuwe versie (per profiel 3 tot 5 korte zinnen: wat verandert er en waarom).
- Is de instructie onduidelijk of niet uitvoerbaar met deze onderdelen (popup, stickyBar, socialProof, carousel.title, loyalty, show)? Doe dan het deel dat wel kan en zeg in "summary" wat je niet kon.
- "summary": 1 tot 2 korte Nederlandse zinnen over wat je hebt aangepast.

${guidelines(brandName, defaults)}

Antwoord uitsluitend met JSON in dit formaat:
{"summary":"","profiles":[{"key":"","name":"","description":"","signals":"","changes":[""],"show":{"popup":true,"stickyBar":true,"socialProof":true,"carousel":true,"loyalty":false,"storyRow":true},"popup":{"headline":"","sub":"","cta":"","code":""},"stickyBar":{"text":"","cta":""},"socialProof":{"text":""},"carousel":{"title":""},"loyalty":{"programName":"","currentPoints":0}}]}`;
}

// Past bestaande profielen aan op een vrije instructie.
// opts: { profiles, instruction, brief, chat }. Retourneert { profiles, summary } of null.
async function refineProfiles(brandName, facts, defaults, opts, log = console.log) {
  loadDotEnv();
  const instruction = cleanPrompt(opts.instruction, 600);
  if (!instruction || !opts.profiles || !opts.profiles.length) return null;
  if (!process.env.OPENROUTER_API_KEY) { log('  ⚠ OPENROUTER_API_KEY niet gezet — aanpassing via prompt overgeslagen'); return null; }
  try {
    const brief = cleanPrompt(opts.brief, 800);
    const chat = (opts.chat || []).slice(-6);
    const { data: raw, model } = await chatJson(buildRefinePrompt(brandName, facts, defaults, { profiles: opts.profiles, instruction, brief, chat }), { temperature: 0.6, timeoutMs: 90000, log });
    const profiles = (Array.isArray(raw.profiles) ? raw.profiles : []).map(sanitizeProfile).filter(Boolean).slice(0, 3);
    if (!profiles.length) throw new Error('geen bruikbare profielen in het antwoord');
    const seen = new Set();
    profiles.forEach((p, i) => { while (seen.has(p.key)) p.key = `${p.key}-${i + 1}`; seen.add(p.key); });
    const summary = clean(raw.summary, 300);
    log(`  ↳ aangepast via prompt (${model}): ${summary || 'ok'}`);
    return { profiles, summary };
  } catch (err) {
    log(`  ⚠ aanpassing via prompt mislukt (${err.message}) — vorige versie behouden`);
    return null;
  }
}

module.exports = { generateProfiles, refineProfiles, sanitizeProfile, cleanPrompt, LIMITS, BLOCK_KEYS };
