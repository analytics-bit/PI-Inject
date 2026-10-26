// OpenRouter-hulpjes: .env laden en de AI de plek voor de recommendation-carrousel laten kiezen.
// (De bezoekersprofielen en teksten staan in lib/profiles.js.)
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

const FALLBACK_MODEL = 'openai/gpt-4o-mini';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Eén JSON-antwoord van OpenRouter. Bij een tijdelijke fout (rate limit 429, 5xx, timeout) wordt het
// opnieuw geprobeerd met wachttijd, daarna met een tweede goedkoop model (OPENROUTER_FALLBACK_MODEL).
// Geeft { data (geparsed JSON), model } of gooit een Error.
async function chatJson(prompt, { temperature = 0.5, timeoutMs = 60000, log = console.log } = {}) {
  loadDotEnv();
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY niet gezet');
  const primary = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const fallback = process.env.OPENROUTER_FALLBACK_MODEL || FALLBACK_MODEL;
  const plan = [[primary, 0], [primary, 4000], [fallback, 0], [fallback, 6000]]; // [model, wachttijd vooraf]
  let lastErr;
  for (const [model, wait] of plan) {
    if (wait) await sleep(wait);
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'PI Marketing PDP demo' },
        body: JSON.stringify({ model, temperature, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.retry = res.status === 429 || res.status >= 500;
        throw err;
      }
      const body = await res.json();
      const text = (body.choices?.[0]?.message?.content || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
      return { data: JSON.parse(text), model };
    } catch (err) {
      lastErr = err;
      const retryable = err.retry || err.name === 'TimeoutError' || err instanceof SyntaxError;
      if (!retryable) break;
      log(`  ↻ AI-aanroep (${model}) mislukt: ${err.message}${model === fallback && wait ? '' : ', opnieuw proberen'}`);
    }
  }
  throw lastErr;
}

// Laat de AI kiezen waar de recommendation-carrousel op de pagina hoort.
// outline ={ sections: [...], pageHeight, footerTop } uit lib/outline.js.
// Retourneert { index, position, reason, source: 'AI' } of null (dan gelden de regels in overlay.js).
async function pickPlacement(brandName, outline, log = console.log) {
  loadDotEnv();
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || !outline || !outline.sections || outline.sections.length < 3) return null;
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
    const { data: r } = await chatJson(prompt, { temperature: 0.2, timeoutMs: 45000, log });
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

module.exports = { pickPlacement, chatJson, loadDotEnv, DEFAULT_MODEL };
