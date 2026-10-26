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
const { pickPlacement } = require('./copy');
const { generateProfiles, sanitizeProfile, BLOCK_KEYS } = require('./profiles');
const { installBlocks } = require('./blocks');
const { extractOutline } = require('./outline');

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
  socialProof: { text: '23 anderen bekeken dit product vandaag', position: 'below-cta' },
  carousel: { title: 'Anderen bekeken ook' },
  // Spaarpunten voor leden: programName leeg = "<merk> Members". Punten en stappen zijn demo-waarden.
  loyalty: { programName: '', pointsPerEuro: 1, currentPoints: 200, milestones: [750, 1000, 2000, 4000] },
  // Story-rij: ronde productplaatjes boven de vouw; count = aantal stories
  storyRow: { count: 8 },
};

// "€ 119.95" / "€ 8,50" / "1.299,00" -> getal; null als er niets te lezen valt
function parsePrice(s) {
  const m = String(s || '').match(/\d[\d.,]*/);
  if (!m) return null;
  let t = m[0];
  const lastComma = t.lastIndexOf(','), lastDot = t.lastIndexOf('.');
  if (lastComma > lastDot) t = t.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma) t = lastComma >= 0 ? t.replace(/,/g, '') : (t.length - lastDot - 1 === 3 && t.indexOf('.') === lastDot ? t.replace('.', '') : t);
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

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

// Standaardversie als er geen AI-profielen zijn (geen sleutel, een fout, of bewust zonder AI)
const DEFAULT_PROFILE = { key: 'standaard', name: 'Standaard', description: '', signals: '', changes: [], show: {}, copy: {} };

// Voegt de onderdelen samen voor één profiel.
// Volgorde: globaal uitgezet (checkbox/config) > profiel krijgt het onderdeel niet > profieltekst > standaard.
function mergeProfileConfig(rawConfig, profile) {
  const cfg = {};
  for (const key of BLOCK_KEYS) {
    if (rawConfig[key] === false) { cfg[key] = false; continue; }
    if (profile.show && profile.show[key] === false) { cfg[key] = false; continue; }
    cfg[key] = { ...DEFAULTS[key], ...((profile.copy && profile.copy[key]) || {}), ...(rawConfig[key] || {}) };
  }
  return cfg;
}

// Pagina laden, cookiebanner wegklikken en door de pagina scrollen zodat lazy content laadt
async function preparePage(page, url, log) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
  await dismissCookieBanners(page, log);
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
}

// rawConfig: zoals in configs/<prospect>.json. opts: { outDir, log, launchBrowser, dsf, twemoji }
// De pagina wordt één keer geanalyseerd (huisstijl, feiten, producten, plaatsing); daarna wordt per
// bezoekersprofiel een eigen versie gerenderd (bestanden met voorvoegsel v1-, v2-, ...).
async function runDemo(rawConfig, opts) {
  const { outDir, launchBrowser, dsf = 2, twemoji = false } = opts;
  const log = opts.log || console.log;
  const config = { ...rawConfig };
  config.badgeText = config.badgeText || DEFAULTS.badgeText;
  fs.mkdirSync(outDir, { recursive: true });

  log(`▶ PDP demo voor ${config.name}: ${config.url}`);
  const browser = await launchBrowser();
  // Weergave: desktop (standaard) of mobiel (iPhone-formaat, mobiele layout van de site)
  const mobile = rawConfig.device === 'mobile';
  const ctxDsf = mobile ? Math.max(dsf, 2) : dsf; // klein scherm: altijd scherp renderen
  const context = await browser.newContext(mobile ? {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: ctxDsf,
    isMobile: true,
    hasTouch: true,
    locale: 'nl-NL',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  } : {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: ctxDsf,
    locale: 'nl-NL',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  });
  if (mobile) log('  ↳ weergave: mobiel (390 px breed)');
  // esbuild kan __name()-helpers in geserialiseerde page.evaluate-functies zetten
  await context.addInitScript(() => { window.__name = window.__name || (f => f); });
  const page = await context.newPage();

  try {
    await preparePage(page, config.url, log);

    // Huisstijl en pagina-feiten uitlezen (vóór de site-JS wordt bevroren)
    const brand = await page.evaluate(extractBrandStyle);
    log(`  ↳ huisstijl: font "${(brand.font || '?').split(',')[0]}", knopradius ${brand.btnRadius || '?'}, inkt ${brand.ink || '?'}`);
    const facts = await page.evaluate(extractPageFacts);

    // Secties van de pagina bepalen; een mens (config.carouselAt) of de AI kiest de plek voor de carrousel
    await page.evaluate(installBlocks);
    const outline = await page.evaluate(extractOutline);
    let placementChoice = null;
    const at = rawConfig.carouselAt;
    if (rawConfig.carousel === false) {
      /* geen carrousel: geen plaatsing nodig */
    } else if (at && Number.isInteger(at.index) && (at.position === 'before' || at.position === 'after')) {
      placementChoice = { index: at.index, position: at.position, source: 'zelf gekozen', reason: '' };
    } else if (config.autoPlacement !== false) {
      placementChoice = await pickPlacement(config.name, outline, log);
    }

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

    // Bezoekersprofielen: eigen/eerder gemaakte (uit de webapp) > door de AI bedacht > één standaardversie
    let generated = null, profiles = null;
    if (Array.isArray(rawConfig.profiles) && rawConfig.profiles.length) {
      profiles = rawConfig.profiles.map(sanitizeProfile).filter(Boolean).slice(0, 3);
      generated = rawConfig.persona ? { productType: rawConfig.persona.productType || '', persona: rawConfig.persona } : null;
      log(`  ↳ ${profiles.length} profiel(en) uit eerdere run/eigen aanpassing, geen nieuwe AI-tekst`);
    } else if (config.autoCopy !== false) {
      generated = await generateProfiles(config.name, facts, DEFAULTS, { count: rawConfig.profileCount, hints: rawConfig.profileHints }, log);
      profiles = generated && generated.profiles;
    }
    if (!profiles || !profiles.length) profiles = [DEFAULT_PROFILE];

    // --- Eén versie renderen op een (verse) pagina: injecteren, screenshots, crops, one-pager ---
    const renderVariant = async (vpage, cfg, prefix, profile) => {
      const f = n => path.join(outDir, prefix + n);
      // Bevries de site-JS vóór injectie: sommige shops hebben MutationObservers/
      // re-renders die op onze DOM-mutaties reageren en hun eigen content slopen.
      // page.evaluate blijft gewoon werken (draait via DevTools Runtime).
      const cdp = await context.newCDPSession(vpage);
      await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });

      const injected = await vpage.evaluate(injectOverlay, {
        accent,
        placementChoice,
        brand,
        twemoji,
        brandName: config.name,
        badgeText: config.badgeText,
        popup: cfg.popup || null,
        stickyBar: cfg.stickyBar || null,
        socialProof: cfg.socialProof || null,
        loyalty: cfg.loyalty || null,
        storyRow: cfg.storyRow || null,
        priceNumber: parsePrice(facts.price),
        carousel: cfg.carousel || null,
        recommendations,
      });
      const placement = injected && injected.placement;
      if (placement) log(`  ↳ carrousel geplaatst: ${placement}`);
      if (injected && injected.storyPlacement) log(`  ↳ story-rij geplaatst: ${injected.storyPlacement}`);
      if (twemoji) await vpage.waitForFunction(() => Array.from(document.images).every(i => i.complete), null, { timeout: 8000 }).catch(() => {});
      await vpage.waitForTimeout(1000);

      // --- Screenshot 1: viewport met popup (hero-shot) ---
      await vpage.evaluate(() => window.scrollTo(0, 0));
      await vpage.waitForTimeout(300);
      const shotPopup = f('01-popup.png');
      log('  ↳ screenshots maken…');
      await viewportShot(vpage, shotPopup, log);
      log(`  ✓ ${path.basename(shotPopup)}`);

      // Zelfde beeld zonder popup: toont wat er boven de vouw staat (bijv. de story-rij)
      await vpage.evaluate(() => { for (const id of ['pim-demo-popup', 'pim-demo-backdrop']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; } });
      await viewportShot(vpage, f('01b-above-the-fold.png'), log);
      log(`  ✓ ${prefix}01b-above-the-fold.png`);

      // --- Screenshot 2: full page zonder popup (carrousel + social proof zichtbaar) ---
      // Sticky bar op absolute zetten zodat hij bij full-page netjes bovenaan staat
      await vpage.evaluate(() => {
        const hide = id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
        hide('pim-demo-popup'); hide('pim-demo-backdrop');
        const bar = document.getElementById('pim-demo-stickybar');
        const barBadge = document.getElementById('pim-demo-stickybar-badge');
        if (bar) bar.style.position = 'absolute';
        if (barBadge) barBadge.style.position = 'absolute';
      });
      await vpage.waitForTimeout(300);
      // Sticky/fixed site-elementen neutraliseren zodat ze niet in elke stitch-frame
      // herhalen (chatknoppen, sticky headers). Onze eigen elementen blijven staan.
      await vpage.evaluate(() => {
        for (const el of document.querySelectorAll('body *')) {
          if (el.className && String(el.className).includes('pim-demo')) continue;
          const s = getComputedStyle(el);
          if (s.position === 'fixed' && s.display !== 'none') el.style.setProperty('display', 'none', 'important');
          else if (s.position === 'sticky') el.style.setProperty('position', 'static', 'important');
        }
      });
      // Fullpage via stitching: per viewport scrollen en schieten (lazy content
      // rendert dan zoals bij een echte bezoeker), daarna frames aaneenplakken.
      const shotFull = f('02-fullpage.png');
      await stitchFullPage(vpage, browser, shotFull, ctxDsf, log);
      log(`  ✓ ${path.basename(shotFull)}`);

      // --- Detail-crops per element (voor de one-pager) ---
      const crops = {};
      const cropTargets = [
        ['carousel', '#pim-demo-carousel'],
        ['socialproof', '.pim-demo-socialproof'],
        ['stickybar', '#pim-demo-stickybar'],
        ['loyalty', '.pim-demo-loyalty'],
        ['story', '#pim-demo-story'],
      ];
      for (const [name, sel] of cropTargets) {
        try {
          const el = vpage.locator(sel).first();
          if (await el.count()) {
            await el.scrollIntoViewIfNeeded();
            await vpage.waitForTimeout(200);
            const p = f(`03-detail-${name}.png`);
            await el.screenshot({ path: p });
            crops[name] = p;
            log(`  ✓ ${path.basename(p)}`);
          }
        } catch { /* element niet aanwezig */ }
      }
      // popup-crop: popup weer tonen en los schieten
      try {
        await vpage.evaluate(() => {
          const show = id => { const el = document.getElementById(id); if (el) el.style.display = ''; };
          show('pim-demo-popup'); show('pim-demo-backdrop');
        });
        await vpage.evaluate(() => window.scrollTo(0, 0));
        await vpage.waitForTimeout(300);
        const p = f('03-detail-popup.png');
        await vpage.locator('#pim-demo-popup').screenshot({ path: p });
        crops.popup = p;
        log(`  ✓ ${path.basename(p)}`);
      } catch { /* popup niet aanwezig */ }

      // --- One-pager ---
      await buildOnePager(browser, {
        config, accent, outDir, log, prefix,
        profile: prefix ? profile : null,
        shots: { popup: shotPopup, fullpage: shotFull, crops },
      });
      return { placement: placement || null, storyPlacement: (injected && injected.storyPlacement) || null };
    };

    const results = [];
    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      const prefix = profiles.length > 1 ? `v${i + 1}-` : '';
      const cfg = mergeProfileConfig(rawConfig, profile);
      if (profiles.length > 1) log(`▶ versie ${i + 1} van ${profiles.length}: ${profile.name}`);
      let vpage = page;
      if (i > 0) { // de eerste versie hergebruikt de geanalyseerde pagina; de rest krijgt een verse, onaangeroerde pagina
        vpage = await context.newPage();
        await preparePage(vpage, config.url, log);
        await vpage.evaluate(installBlocks);
      }
      try {
        results.push({ profile, cfg, prefix, info: await renderVariant(vpage, cfg, prefix, profile) });
      } finally {
        if (i > 0) await vpage.close().catch(() => {});
      }
    }

    fs.writeFileSync(path.join(outDir, 'persona.json'), JSON.stringify({
      facts,
      generated: generated ? { productType: generated.productType, persona: generated.persona } : null,
      profiles: results.map(r => ({
        key: r.profile.key, name: r.profile.name, description: r.profile.description, signals: r.profile.signals,
        changes: r.profile.changes, show: r.profile.show, copy: r.cfg, prefix: r.prefix,
      })),
      meta: {
        accent, accentSource, palette: brand.palette,
        placement: results[0].info.placement, storyPlacement: results[0].info.storyPlacement,
        // compacte sectielijst voor het keuzemenu "Plaatsing" in de webapp
        outline: outline.sections.map(s => ({ i: s.i, label: (s.heading || s.hint || 'sectie').slice(0, 50) })),
      },
    }, null, 2));

    log('✔ Klaar');
  } finally {
    await browser.close();
  }
}

module.exports = { runDemo, slugify, DEFAULTS, viewportShot };
