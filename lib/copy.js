// Persona + copy via OpenRouter. Leest de PDP-feiten, bepaalt producttype en
// doelpersona en schrijft de teksten voor popup, sticky bar, social proof en carrousel.
// Sleutel komt uit env OPENROUTER_API_KEY (of .env) — nooit in de code of config zetten.
// Model: env OPENROUTER_MODEL, standaard een goedkoop model.
const fs = require('fs');
const path = require('path');

const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite';

function loadDotEnv() {
  const p = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function buildPrompt(brandName, facts, defaults) {
  return `Je bent conversie-copywriter voor PI Marketing (e-mail- en onsite-personalisatie voor webshops). Je maakt een sales-demo voor de webshop "${brandName}".

Productpagina-feiten (JSON):
${JSON.stringify(facts, null, 2)}

Taken:
1. Bepaal welk type product dit is (productType, kort).
2. Bedenk één concrete doelpersona die dit product waarschijnlijk koopt (leeftijdsgroep, situatie, wat ze belangrijk vinden, waar ze twijfelen).
3. Schrijf Nederlandse copy die specifiek voor die persona is: spreek hun motivatie of twijfel aan, in de toon die bij het merk en de persona past. Geen algemene "korting"-tekst.

Regels:
- Gebruik voor verzending, retour en levertijd ALLEEN wat in "shipping" of "excerpt" staat. Verzin geen voorwaarden of drempelbedragen. Staat er niets bruikbaars, schrijf dan over iets anders (bijv. gemak of pasvorm) in plaats van een claim.
- De popup-prikkel is demo-waarde: gebruik "${defaults.popup.code}" als code en een kortingspercentage van 10%, tenzij de feiten iets anders zeggen.
- Social proof is een demo-placeholder: een plausibel, niet extreem getal, passend bij het product (bijv. "37 mensen bekeken deze sneaker vandaag").
- Maximale lengtes: popup.headline 45 tekens, popup.sub 120, popup.cta 28, stickyBar.text 80 (mag 1 emoji aan het begin), stickyBar.cta 16, socialProof.text 60, carousel.title 50, loyalty.programName 28.
- loyalty.programName: de naam van een plausibel spaar-/ledenprogramma voor deze webshop, kort en passend bij het merk en de doelgroep, bijvoorbeeld "${brandName} Members" of "${brandName} Club". Alleen de naam, geen zin.
- Geen aanhalingstekens of HTML in de teksten.

Antwoord uitsluitend met JSON in dit formaat:
{"productType":"","persona":{"name":"","description":"","motivations":[""],"objections":[""]},"popup":{"headline":"","sub":"","cta":"","code":""},"stickyBar":{"text":"","cta":""},"socialProof":{"text":""},"carousel":{"title":""},"loyalty":{"programName":""}}`;
}

const LIMITS = { popup: { headline: 45, sub: 120, cta: 28, code: 20 }, stickyBar: { text: 80, cta: 16 }, socialProof: { text: 60 }, carousel: { title: 50 }, loyalty: { programName: 28 } };

function sanitize(raw) {
  const out = { productType: String(raw.productType || '').slice(0, 80), persona: raw.persona || null };
  for (const [block, fields] of Object.entries(LIMITS)) {
    if (!raw[block] || typeof raw[block] !== 'object') continue;
    out[block] = {};
    for (const [f, max] of Object.entries(fields)) {
      const v = raw[block][f];
      if (typeof v !== 'string' || !v.trim()) continue;
      // HTML wordt later ge-innerHTML'd: tags en aanhalingstekens eruit
      let t = v.replace(/<[^>]*>/g, '').replace(/["“”]/g, '').trim();
      if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, '').trim();
      if (t) out[block][f] = t;
    }
  }
  return out;
}

// Retourneert { productType, persona, popup, stickyBar, socialProof, carousel } of null (dan gelden de standaardteksten).
async function generateCopy(brandName, facts, defaults, log = console.log) {
  loadDotEnv();
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) { log('  ⚠ OPENROUTER_API_KEY niet gezet — standaardteksten gebruikt'); return null; }
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'PI Marketing PDP demo' },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: buildPrompt(brandName, facts, defaults) }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    let text = data.choices?.[0]?.message?.content || '';
    text = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    const parsed = sanitize(JSON.parse(text));
    log(`  ↳ persona (${model}): ${parsed.persona?.name || '?'} — ${parsed.productType}`);
    return parsed;
  } catch (err) {
    log(`  ⚠ copy genereren mislukt (${err.message}) — standaardteksten gebruikt`);
    return null;
  }
}

// Laat de AI kiezen waar de recommendation-carrousel op de pagina hoort.
// outline = { sections: [...], pageHeight, footerTop } uit lib/outline.js.
// Retourneert { index, position, reason, source: 'AI' } of null (dan gelden de regels in overlay.js).
async function pickPlacement(brandName, outline, log = console.log) {
  loadDotEnv();
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || !outline || !outline.sections || outline.sections.length < 3) return null;
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const sections = outline.sections.slice(0, 40);
  const prompt = `Je bent CRO-specialist. Hieronder staan de secties van een productpagina van "${brandName}", van boven naar beneden (index, kop, hint uit id/class, positie in px, hoogte, aantal productlinks met plaatje, hasH1/hasBuyButton, begin van de tekst).

Taak: bepaal waar een extra aanbevelingscarrousel ("Anderen bekeken ook", 4 producten) het meest logisch en effectief staat.

Regels:
- Nooit boven of tussen de productinformatie en koopknop (secties met hasH1 of hasBuyButton).
- Liefst nadat de bezoeker de productinformatie, beschrijving/FAQ en eventueel reviews heeft gezien.
- Staat er al een aanbevelingsblok ("selectie voor jou", "gerelateerd", "vaak samen gekocht", veel productlinks): zet de carrousel er direct vóór ("before"), niet erna. "Eerder bekeken" / "recently viewed" telt niet als aanbevelingsblok.
- Niet onderaan vlak voor de footer, tenzij er niets anders is; streef naar ongeveer 40 tot 70 procent van de paginahoogte (${outline.pageHeight}px).
- Kies alleen een index die in de lijst staat.

Secties (JSON):
${JSON.stringify(sections)}

Antwoord uitsluitend met JSON: {"index": <getal>, "position": "before" of "after", "reason": "<maximaal 12 woorden, Nederlands>"}`;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'PI Marketing PDP demo' },
      body: JSON.stringify({ model, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const text = (data.choices?.[0]?.message?.content || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    const r = JSON.parse(text);
    const index = Number.isInteger(r.index) ? r.index : parseInt(r.index, 10);
    const position = r.position === 'before' || r.position === 'after' ? r.position : null;
    if (!Number.isInteger(index) || index < 0 || index >= outline.sections.length || !position) throw new Error('ongeldig antwoord');
    // Vangnet: nooit in of boven de productinformatie
    let productEnd = -1;
    outline.sections.forEach(s => { if (s.hasH1 || s.hasBuyButton) productEnd = Math.max(productEnd, s.i); });
    if (position === 'before' ? index <= productEnd : index < productEnd) throw new Error('keuze valt in de productinformatie');
    const reason = String(r.reason || '').replace(/<[^>]*>/g, '').replace(/["<>]/g, '').trim().slice(0, 100);
    return { index, position, reason, source: 'AI' };
  } catch (err) {
    log(`  ⚠ AI-plaatsing mislukt (${err.message}), standaardregels gebruikt`);
    return null;
  }
}

module.exports = { generateCopy, pickPlacement, loadDotEnv };
