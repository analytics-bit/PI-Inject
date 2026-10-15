// PDP Demo Generator — PI Marketing
// Herbruikbare kern: runDemo(config, opts). Gebruikt door de CLI (generate.js)
// en door de webapp (lib/job.js).
//
// Neemt een full-page screenshot van de PDP van een prospect met daaroverheen
// onze dienstverlening geïnjecteerd (popup, recommendations-carrousel,
// social proof, sticky bar), duidelijk gemarkeerd als door PI Marketing toegevoegd.
// Output: screenshots + opgemaakte one-pager (PDF) in output/<prospect>/.

const fs = require('fs');
const path = require('path');
const { injectOverlay } = require('./overlay');
const { scrapeProducts } = require('./scrape');
const { buildOnePager } = require('./onepager');
const { extractBrandStyle } = require('./style');
const { extractPageFacts } = require('./facts');
const { generateCopy } = require('./copy');

const DEFAULTS = {
  accentColor: null, // null = auto-detect van de koopknop
  badgeText: 'Geïnjecteerd door PI Marketing',
  popup: {
    headline: 'Ontvang 10% korting',
    sub: 'Schrijf je in voor de nieuwsbrief en ontvang direct 10% korting op je eerste bestelling.',
    cta: 'Ja, ik wil korting',
    code: 'WELKOM10',
  },
  stickyBar: { text: '🚚 Vandaag besteld = morgen in huis · Gratis verzending vanaf €50', cta: 'Shop nu' },
  socialProof: { text: '23 anderen bekeken dit product vandaag' },
  carousel: { title: 'Anderen bekeken ook' },
};

async function dismissCookieBanners(page, log = console.log) {
  const patterns = /^(alles accepteren|accepteer alles|accepteren|alles toestaan|akkoord|accept all|accept( cookies)?|allow all|toestaan|ja, ik ga akkoord|ik ga akkoord|prima|ok[eé]?)$/i;
  // bekende accept-knoppen van veelgebruikte consent-tools
  const knownSelectors = [
    '#cookiescript_accept', '#onetrust-accept-btn-handler', '.cky-btn-accept',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', '#CybotCookiebotDialogBodyButtonAccept',
    '.cc-allow', '.cm-btn-success', '[data-testid="uc-accept-all-button"]', '#didomi-notice-agree-button',
  ];
  try {
    await page.waitForTimeout(1500);
    const clicked = await page.evaluate(({ reSrc, knownSelectors }) => {
      const re = new RegExp(reSrc, 'i');
      const roots = [document];
      document.querySelectorAll('*').forEach(el => { if (el.shadowRoot) roots.push(el.shadowRoot); });
      for (const root of roots) {
        for (const sel of knownSelectors) {
          const el = root.querySelector(sel);
          if (el) { el.click(); return `${sel}`; }
        }
      }
      for (const root of roots) {
        // ook divs/spans die als knop fungeren (bijv. CookieScript)
        for (const b of root.querySelectorAll('button, a, [role="button"], div, span')) {
          const t = (b.innerText || '').trim();
          if (t && t.length < 40 && re.test(t) && b.children.length === 0) { b.click(); return t; }
        }
      }
      return null;
    }, { reSrc: patterns.source, knownSelectors });
    if (clicked) log(`  ↳ cookiebanner weggeklikt ("${clicked}")`);
    await page.waitForTimeout(1200);
    // fallback: bekende consent-containers verwijderen + native top-layer dialogs sluiten
    await page.evaluate(() => {
      ['#onetrust-consent-sdk', '#CybotCookiebotDialog', '#cookiebot', '.cookie-banner', '#usercentrics-root', '#coiOverlay']
        .forEach(sel => document.querySelectorAll(sel).forEach(el => el.remove()));
      document.querySelectorAll('dialog[open]').forEach(d => {
        if (/cookie|privacy|consent/i.test(d.textContent || '')) { try { d.close(); } catch {} d.remove(); }
      });
    });
  } catch { /* niet blokkerend */ }
}

// Viewport-screenshot met terugval: Playwright wacht voor een screenshot o.a. op webfonts en
// lazy rendering, en kan in serverless Chromium blijven hangen. Dan pakken we het beeld
// rechtstreeks via het DevTools-protocol (zonder die wachtstappen).
async function viewportShot(page, outPath, log = () => {}) {
  try {
    await page.screenshot({ path: outPath, timeout: 25000 });
  } catch (err) {
    log(`  ⚠ screenshot via Playwright mislukt (${String(err.message).slice(0, 100)}), terugval op DevTools`);
    const cdp = await page.context().newCDPSession(page);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
    await cdp.detach().catch(() => {});
  }
}

async function stitchFullPage(page, browser, outPath, dsf = 2, log = () => {}) {
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pim-stitch-'));
  const vp = page.viewportSize();
  const pageH = await page.evaluate(() => document.documentElement.scrollHeight);
  const frames = [];
  let y = 0;
  while (y < pageH) {
    const scrollY = Math.min(y, Math.max(0, pageH - vp.height));
    await page.evaluate(sy => window.scrollTo(0, sy), scrollY);
    await page.waitForTimeout(450);
    const framePath = path.join(tmpDir, `frame-${frames.length}.png`);
    await viewportShot(page, framePath, log);
    frames.push({ path: framePath, top: scrollY * dsf });
    if (scrollY >= pageH - vp.height) break;
    y += vp.height;
  }
  await page.evaluate(() => window.scrollTo(0, 0));

  // Compositie in een kale pagina (geen lazy/JS-issues): frames absoluut stapelen.
  const totalH = Math.min(pageH, frames.length ? (frames[frames.length - 1].top / dsf) + vp.height : vp.height) * dsf;
  const imgs = frames.map(f => `<img src="file://${f.path}" style="position:absolute;left:0;top:${f.top}px;width:${vp.width * dsf}px;display:block;">`).join('');
  const stitchHtml = path.join(tmpDir, 'stitch.html');
  fs.writeFileSync(stitchHtml, `<!doctype html><html><body style="margin:0;position:relative;width:${vp.width * dsf}px;height:${totalH}px;">${imgs}</body></html>`);
  const stitchPage = await browser.newPage({ viewport: { width: vp.width * dsf, height: Math.min(totalH, 4000) }, deviceScaleFactor: 1 });
  await stitchPage.goto('file://' + stitchHtml, { waitUntil: 'load' });
  await stitchPage.waitForTimeout(300);
  await stitchPage.screenshot({ path: outPath, fullPage: true });
  await stitchPage.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

// rawConfig: zoals in configs/<prospect>.json. opts: { outDir, log, launchBrowser, dsf }
async function runDemo(rawConfig, opts) {
  const { outDir, launchBrowser, dsf = 2, twemoji = false } = opts;
  const log = opts.log || console.log;
  const config = { ...rawConfig };
  config.badgeText = config.badgeText || DEFAULTS.badgeText;
  fs.mkdirSync(outDir, { recursive: true });

  log(`▶ PDP demo voor ${config.name}: ${config.url}`);
  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: dsf,
    locale: 'nl-NL',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  });
  // esbuild kan __name()-helpers in geserialiseerde page.evaluate-functies zetten
  await context.addInitScript(() => { window.__name = window.__name || (f => f); });
  const page = await context.newPage();

  try {
    await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
    await dismissCookieBanners(page, log);

    // Lazy-loaded content triggeren door de pagina door te scrollen
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 700) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(800);

    // Huisstijl en pagina-feiten uitlezen (vóór de site-JS wordt bevroren)
    const brand = await page.evaluate(extractBrandStyle);
    log(`  ↳ huisstijl: font "${(brand.font || '?').split(',')[0]}", knopradius ${brand.btnRadius || '?'}, inkt ${brand.ink || '?'}`);
    const facts = await page.evaluate(extractPageFacts);

    // Persona + copy op maat (OpenRouter). Volgorde: config > gegenereerd > standaard.
    let generated = null;
    if (config.autoCopy !== false) generated = await generateCopy(config.name, facts, DEFAULTS, log);
    for (const key of ['popup', 'stickyBar', 'socialProof', 'carousel']) {
      if (rawConfig[key] !== false) {
        config[key] = { ...DEFAULTS[key], ...((generated && generated[key]) || {}), ...(rawConfig[key] || {}) };
      }
    }
    const final = Object.fromEntries(['popup', 'stickyBar', 'socialProof', 'carousel'].map(k => [k, config[k]]));
    const writePersona = meta => fs.writeFileSync(path.join(outDir, 'persona.json'), JSON.stringify({ facts, generated, final, meta }, null, 2));
    writePersona(null);

    // Accentkleur: config > koopknop/merkkleur van de pagina > neutraal donker (nooit een verzonnen kleur)
    let accent = config.accentColor, accentSource = accent ? 'zelf gekozen' : null;
    if (!accent) { accent = brand.accent; accentSource = brand.accentSource; }
    if (accent) {
      log(`  ↳ accentkleur ${accent} (${accentSource})${brand.palette.length > 1 ? ', palet: ' + brand.palette.map(p => p.color + ' ' + p.source).join(', ') : ''}`);
    } else {
      accent = '#1a1f2b'; accentSource = 'niet gevonden';
      log('  ⚠ geen merkkleur gevonden — neutraal donker gebruikt; kies zelf een accentkleur voor een beter resultaat');
    }

    // Aanbevelingen: uit config, anders van de PDP zelf, anders van een categoriepagina
    let recommendations = config.recommendations || [];
    if (!recommendations.length) {
      recommendations = await page.evaluate(scrapeProducts);
      log(`  ↳ ${recommendations.length} producten van de PDP gescraped voor de carrousel`);
    }
    if (recommendations.length < 4 && config.catalogUrl) {
      log(`  ↳ te weinig producten, categoriepagina scrapen: ${config.catalogUrl}`);
      const catPage = await context.newPage();
      try {
        await catPage.goto(config.catalogUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await catPage.waitForTimeout(2000);
        await catPage.evaluate(async () => {
          for (let y = 0; y < 3000; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 150)); }
          window.scrollTo(0, 0);
        });
        const extra = await catPage.evaluate(scrapeProducts);
        const seen = new Set(recommendations.map(r => r.url));
        recommendations.push(...extra.filter(r => !seen.has(r.url) && r.url !== config.url));
        log(`  ↳ ${extra.length} producten van de categoriepagina, totaal ${recommendations.length}`);
      } finally {
        await catPage.close();
      }
    }
    if (recommendations.length < 4) {
      log('  ⚠ minder dan 4 producten gevonden — vul "recommendations" of "catalogUrl" aan in de config');
    }
    // voorkeur voor producten mét prijs (geloofwaardiger carrousel)
    recommendations.sort((a, b) => (b.price ? 1 : 0) - (a.price ? 1 : 0));

    // Bevries de site-JS vóór injectie: sommige shops hebben MutationObservers/
    // re-renders die op onze DOM-mutaties reageren en hun eigen content slopen.
    // page.evaluate blijft gewoon werken (draait via DevTools Runtime).
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });

    // Injecteer alle demo-elementen
    const injected = await page.evaluate(injectOverlay, {
      accent,
      brand,
      twemoji,
      brandName: config.name,
      badgeText: config.badgeText,
      popup: config.popup || null,
      stickyBar: config.stickyBar || null,
      socialProof: config.socialProof || null,
      carousel: config.carousel || null,
      recommendations,
    });
    const placement = injected && injected.placement;
    if (placement) log(`  ↳ carrousel geplaatst: ${placement}`);
    writePersona({ accent, accentSource, palette: brand.palette, placement: placement || null });
    if (twemoji) await page.waitForFunction(() => Array.from(document.images).every(i => i.complete), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // --- Screenshot 1: viewport met popup (hero-shot) ---
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const shotPopup = path.join(outDir, '01-popup.png');
    log('  ↳ screenshots maken…');
    await viewportShot(page, shotPopup, log);
    log(`  ✓ ${path.basename(shotPopup)}`);

    // --- Screenshot 2: full page zonder popup (carrousel + social proof zichtbaar) ---
    // Sticky bar op absolute zetten zodat hij bij full-page netjes bovenaan staat
    await page.evaluate(() => {
      const hide = id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
      hide('pim-demo-popup'); hide('pim-demo-backdrop');
      const bar = document.getElementById('pim-demo-stickybar');
      const barBadge = document.getElementById('pim-demo-stickybar-badge');
      if (bar) bar.style.position = 'absolute';
      if (barBadge) barBadge.style.position = 'absolute';
    });
    await page.waitForTimeout(300);
    // Sticky/fixed site-elementen neutraliseren zodat ze niet in elke stitch-frame
    // herhalen (chatknoppen, sticky headers). Onze eigen elementen blijven staan.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('body *')) {
        if (el.className && String(el.className).includes('pim-demo')) continue;
        const s = getComputedStyle(el);
        if (s.position === 'fixed' && s.display !== 'none') el.style.setProperty('display', 'none', 'important');
        else if (s.position === 'sticky') el.style.setProperty('position', 'static', 'important');
      }
    });
    // Fullpage via stitching: per viewport scrollen en schieten (lazy content
    // rendert dan zoals bij een echte bezoeker), daarna frames aaneenplakken.
    // fullPage-capture en extreem hoge viewports geven op veel shops lege secties.
    const shotFull = path.join(outDir, '02-fullpage.png');
    await stitchFullPage(page, browser, shotFull, dsf, log);
    log(`  ✓ ${path.basename(shotFull)}`);

    // --- Detail-crops per element (voor de one-pager) ---
    const crops = {};
    const cropTargets = [
      ['carousel', '#pim-demo-carousel'],
      ['socialproof', '.pim-demo-socialproof'],
      ['stickybar', '#pim-demo-stickybar'],
    ];
    for (const [name, sel] of cropTargets) {
      try {
        const el = page.locator(sel).first();
        if (await el.count()) {
          await el.scrollIntoViewIfNeeded();
          await page.waitForTimeout(200);
          const p = path.join(outDir, `03-detail-${name}.png`);
          await el.screenshot({ path: p });
          crops[name] = p;
          log(`  ✓ ${path.basename(p)}`);
        }
      } catch { /* element niet aanwezig */ }
    }
    // popup-crop: popup weer tonen en los schieten
    try {
      await page.evaluate(() => {
        const show = id => { const el = document.getElementById(id); if (el) el.style.display = ''; };
        show('pim-demo-popup'); show('pim-demo-backdrop');
      });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      const p = path.join(outDir, '03-detail-popup.png');
      await page.locator('#pim-demo-popup').screenshot({ path: p });
      crops.popup = p;
      log(`  ✓ ${path.basename(p)}`);
    } catch { /* popup niet aanwezig */ }

    // --- One-pager ---
    await buildOnePager(browser, {
      config, accent, outDir, log,
      shots: { popup: shotPopup, fullpage: shotFull, crops },
    });

    log('✔ Klaar');
  } finally {
    await browser.close();
  }
}

module.exports = { runDemo, slugify, DEFAULTS, viewportShot };
