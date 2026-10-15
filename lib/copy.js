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
- Maximale lengtes: popup.headline 45 tekens, popup.sub 120, popup.cta 28, stickyBar.text 80 (mag 1 emoji aan het begin), stickyBar.cta 16, socialProof.text 60, carousel.title 50.
- Geen aanhalingstekens of HTML in de teksten.

Antwoord uitsluitend met JSON in dit formaat:
{"productType":"","persona":{"name":"","description":"","motivations":[""],"objections":[""]},"popup":{"headline":"","sub":"","cta":"","code":""},"stickyBar":{"text":"","cta":""},"socialProof":{"text":""},"carousel":{"title":""}}`;
}

const LIMITS = { popup: { headline: 45, sub: 120, cta: 28, code: 20 }, stickyBar: { text: 80, cta: 16 }, socialProof: { text: 60 }, carousel: { title: 50 } };

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

module.exports = { generateCopy };
