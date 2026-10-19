// Bouwt de opgemaakte one-pager (PDF + PNG) met de gemaakte screenshots erin.
const fs = require('fs');
const path = require('path');

function b64(p) {
  return `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
}

const BLOCKS = [
  {
    key: 'popup', icon: '✉️', title: 'Slimme pop-ups',
    text: 'Leadgen- en kortingspopups op het juiste moment, alleen voor bezoekers die nog geen klant zijn. Groei van het e-mailbestand én directe conversie.',
    stat: 'Gem. 3–6% van bezoekers laat e-mailadres achter',
  },
  {
    key: 'carousel', icon: '🛍️', title: 'Product recommendations',
    text: 'Persoonlijke productaanbevelingen op de productpagina, gebaseerd op kijk- en koopgedrag. Volledig geautomatiseerd, in jullie eigen huisstijl.',
    stat: 'Hogere orderwaarde door cross- & upsell',
  },
  {
    key: 'socialproof', icon: '🔥', title: 'Social proof & urgentie',
    text: 'Realtime signalen zoals "23 anderen bekeken dit product" direct bij de koopknop. Bewezen effect op de conversieratio.',
    stat: 'Meer overtuiging op het beslismoment',
  },
  {
    key: 'stickybar', icon: '📣', title: 'Sticky bars & campagnes',
    text: 'Site-brede boodschappen — gratis verzending, acties, nieuwsbrief-CTA — zonder dat er een developer aan te pas komt.',
    stat: 'Live binnen een dag, zelf aan te passen',
  },
];

function buildHtml({ config, accent, shots }) {
  const blocks = BLOCKS.filter(b => shots.crops[b.key]).map(b => `
    <div class="block">
      <div class="block-img"><img src="${b64(shots.crops[b.key])}" alt=""></div>
      <div class="block-txt">
        <h3>${b.icon} ${b.title}</h3>
        <p>${b.text}</p>
        <div class="stat">${b.stat}</div>
      </div>
    </div>`).join('');

  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1a1f2b; background: #fff; }
    .page { width: 210mm; min-height: 296mm; padding: 14mm 16mm; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 3px solid ${accent}; padding-bottom: 6mm; margin-bottom: 8mm; }
    .logo { font-size: 20px; font-weight: 900; letter-spacing: -.02em; }
    .logo span { color: ${accent}; }
    .for { font-size: 13px; color: #5a6270; font-weight: 600; }
    h1 { font-size: 26px; font-weight: 900; line-height: 1.2; margin-bottom: 4mm; }
    h1 em { color: ${accent}; font-style: normal; }
    .intro { font-size: 13.5px; line-height: 1.55; color: #3c4453; margin-bottom: 8mm; max-width: 165mm; }
    .blocks { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
    .block { border: 1px solid #e6e9ee; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
    .block-img { background: #f4f6f9; padding: 5mm; display: flex; align-items: center; justify-content: center; height: 52mm; }
    .block-img img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,.12); }
    .block-txt { padding: 4mm 5mm 5mm; }
    .block-txt h3 { font-size: 14px; margin-bottom: 2mm; }
    .block-txt p { font-size: 11px; line-height: 1.5; color: #3c4453; margin-bottom: 2.5mm; }
    .stat { display: inline-block; font-size: 10px; font-weight: 700; color: ${accent}; background: color-mix(in srgb, ${accent} 10%, white); padding: 1.5mm 3mm; border-radius: 999px; }
    footer { margin-top: 8mm; padding-top: 4mm; border-top: 1px solid #e6e9ee; display: flex; justify-content: space-between; font-size: 10.5px; color: #5a6270; }
    footer b { color: #1a1f2b; }
    .hero-note { font-size: 13.5px; line-height: 1.55; color: #3c4453; margin-bottom: 6mm; max-width: 165mm; }
    .hero-shot { border-radius: 10px; overflow: hidden; box-shadow: 0 6px 28px rgba(0,0,0,.18); border: 1px solid #e6e9ee; }
    .hero-shot { text-align: center; }
    .hero-shot img { width: auto; max-width: 100%; max-height: 215mm; display: inline-block; vertical-align: top; }
    .legend { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 4mm; font-size: 11px; font-weight: 700; color: ${accent}; }
    .legend .dash { width: 26px; height: 0; border-top: 3px dashed ${accent}; display: inline-block; }
  </style></head><body>

  <div class="page">
    <header>
      <div class="logo">PI <span>Marketing</span></div>
      <div class="for">Demo op maat voor ${config.name}</div>
    </header>
    <h1>Zo ziet <em>${config.name}</em> eruit met marketing automation van PI Marketing</h1>
    <p class="intro">Dit zijn geen mockups uit een template — dit is jullie échte productpagina, met daaroverheen de onderdelen die wij voor e-commerce MKB-bedrijven bouwen en beheren. Alles wat een gestippelde rand heeft, injecteren wij: zonder verbouwing van jullie webshop, live binnen enkele weken.</p>
    <div class="blocks">${blocks}</div>
    <footer>
      <div><b>PI Marketing</b> · marketing automation voor e-commerce</div>
      <div>sander@pimarketing.nl · pimarketing.nl</div>
    </footer>
  </div>

  <div class="page">
    <header>
      <div class="logo">PI <span>Marketing</span></div>
      <div class="for">Demo op maat voor ${config.name}</div>
    </header>
    <h1>Jullie productpagina, <em>verrijkt</em></h1>
    <p class="hero-note">Hieronder jullie eigen productpagina zoals een bezoeker die zou zien, inclusief welkomstpopup. Alle elementen met een gestippelde rand worden door ons toegevoegd en doorgemeten — jullie team hoeft er niets voor te bouwen.</p>
    <div class="legend"><span class="dash"></span> = geïnjecteerd door PI Marketing</div>
    <div class="hero-shot"><img src="${b64(shots.popup)}" alt=""></div>
    <footer>
      <div><b>Benieuwd wat dit voor jullie omzet doet?</b> We laten het graag live zien.</div>
      <div>sander@pimarketing.nl</div>
    </footer>
  </div>

  </body></html>`;
}

async function buildOnePager(browser, { config, accent, outDir, shots, log = console.log }) {
  const html = buildHtml({ config, accent, shots });
  const htmlPath = path.join(outDir, 'onepager.html');
  fs.writeFileSync(htmlPath, html);

  const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
  await page.goto('file://' + htmlPath, { waitUntil: 'load' });
  await page.pdf({ path: path.join(outDir, 'onepager.pdf'), format: 'A4', printBackground: true });
  await page.screenshot({ path: path.join(outDir, 'onepager.png'), fullPage: true });
  await page.close();
  log('  ✓ onepager.pdf (+ .png)');
}

module.exports = { buildOnePager };
