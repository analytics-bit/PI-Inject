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
const { generateProfiles, refineProfiles, sanitizeProfile, BLOCK_KEYS, ALWAYS_ON } = require('./profiles');
const { installBlocks } = require('./blocks');
const { addProductToCart } = require('./cart');
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
  // Voorraadmelding: knop onder de koopknop die een "mail mij als het weer op voorraad is"-popup opent.
  // Staat altijd in de demo zolang het onderdeel aan staat (niet per profiel uit te zetten).
  stockAlert: {
    button: 'Mail mij als dit product weer op voorraad is',
    headline: 'Tijdelijk niet op voorraad',
    sub: 'Ontvang een melding zodra dit product weer beschikbaar is.',
    cta: 'Stuur mij een seintje',
  },
  // Kassakoopjes: raster met goedkope meeneemproducten onderaan de checkout-/winkelwagenpagina.
  // Alleen als er een checkoutUrl is; aantal = hoeveel producten (3 per rij op desktop).
  checkoutDeals: { title: 'Kies je kassakoopje', count: 6 },
  // "Mail mijn winkelwagen": knop bij de afrekenknop die een popup opent om de winkelwagen naar jezelf te mailen.
  // Alleen als er een checkoutUrl is.
  mailCart: {
    button: 'Mail mijn winkelwagen naar mezelf',
    headline: 'Mail mijn winkelwagen',
    sub: 'Nog even nadenken? We sturen de producten in je winkelwagen naar je inbox, zodat je later verder kunt.',
    cta: 'Stuur mijn winkelwagen',
  },
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
    // onderdelen op de checkoutpagina bestaan alleen als er een checkoutUrl is
    if ((key === 'checkoutDeals' || key === 'mailCart') && !rawConfig.checkoutUrl) { cfg[key] = false; continue; }
    // voorraadmelding, kassakoopjes en "mail mijn winkelwagen" gaan alleen uit via het vinkje / config, nooit per profiel
    if (!ALWAYS_ON.includes(key) && profile.show && profile.show[key] === false) { cfg[key] = false; continue; }
    cfg[key] = { ...DEFAULTS[key], ...((profile.copy && profile.copy[key]) || {}), ...(rawConfig[key] || {}) };
  }
  return cfg;
}

// Bot-controle (Cloudflare "Even geduld…"/Turnstile, DataDome, PerimeterX) in plaats van de echte pagina?
// Geeft een label terug of null. response mag null zijn (dan alleen titel en elementen).
const BLOCK_TITLE = /^(just a moment|even geduld|een moment geduld|attention required|checking your browser|verify you are human|access denied)/i;
async function detectBlock(page, response) {
  if (response) {
    const h = response.headers();
    if (h['cf-mitigated'] === 'challenge') return 'Cloudflare';
    if ([403, 429, 503].includes(response.status()) && /cloudflare/i.test(h.server || '')) return 'Cloudflare';
  }
  const found = await page.evaluate(() => {
    const has = s => !!document.querySelector(s);
    if (has('#challenge-running, #challenge-form, #cf-challenge-running, iframe[src*="challenges.cloudflare.com"]')) return 'Cloudflare';
    if (has('iframe[src*="captcha-delivery.com"]')) return 'DataDome';
    if (has('#px-captcha')) return 'PerimeterX';
    return null;
  }).catch(() => null);
  if (found) return found;
  const title = (await page.title().catch(() => '')).trim();
  return BLOCK_TITLE.test(title) ? 'bot-detectie' : null;
}

// Wacht tot de gebruiker de controle in het zichtbare venster zelf heeft opgelost (de tool klikt niets aan).
async function waitForHuman(page, timeoutMs = 5 * 60 * 1000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (page.isClosed()) throw new Error('Het Chrome-venster is gesloten voordat de controle was opgelost');
    if (!(await detectBlock(page, null))) {
      await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
      return;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Controle niet op tijd opgelost (5 minuten)');
}

// Pagina laden, cookiebanner wegklikken en door de pagina scrollen zodat lazy content laadt.
// Geeft { blocked } terug: bij een bot-controle stopt hij vóór het cookie- en scrollwerk.
async function preparePage(page, url, log) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
  const blocked = await detectBlock(page, response);
  if (blocked) return { blocked };
  await dismissCookieBanners(page, log);
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
  return { blocked: null };
}

// Context + pagina openen. visible: zichtbaar venster; dan op desktop geen nep-UA, want die botst met de
// client hints van de echte Chrome en laat de controle steeds terugkomen. Mobiel houdt zijn UA (mobiele layout).
async function openSite(browser, { mobile, ctxDsf, visible = false }) {
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
    ...(visible ? {} : { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' }),
  });
  // esbuild kan __name()-helpers in geserialiseerde page.evaluate-functies zetten
  await context.addInitScript(() => { window.__name = window.__name || (f => f); });
  return { context, page: await context.newPage() };
}

// rawConfig: zoals in configs/<prospect>.json. opts: { outDir, log, launchBrowser, dsf, twemoji, interactive, onWaiting }
// interactive: bij een bot-controle een zichtbaar Chrome-venster openen waarin de gebruiker die zelf oplost;
// onWaiting(true/false) meldt wanneer de run op de gebruiker wacht.
// De pagina wordt één keer geanalyseerd (huisstijl, feiten, producten, plaatsing); daarna wordt per
// bezoekersprofiel een eigen versie gerenderd (bestanden met voorvoegsel v1-, v2-, ...).
async function runDemo(rawConfig, opts) {
  const { outDir, launchBrowser, dsf = 2, twemoji = false } = opts;
  const log = opts.log || console.log;
  const config = { ...rawConfig };
  config.badgeText = config.badgeText || DEFAULTS.badgeText;
  fs.mkdirSync(outDir, { recursive: true });

  log(`▶ PDP demo voor ${config.name}: ${config.url}`);
  let browser = await launchBrowser();
  // Weergave: desktop (standaard) of mobiel (iPhone-formaat, mobiele layout van de site)
  const mobile = rawConfig.device === 'mobile';
  const ctxDsf = mobile ? Math.max(dsf, 2) : dsf; // klein scherm: altijd scherp renderen
  let { context, page } = await openSite(browser, { mobile, ctxDsf });
  if (mobile) log('  ↳ weergave: mobiel (390 px breed)');
  let visible = false;

  try {
    let { blocked } = await preparePage(page, config.url, log);
    if (blocked) {
      if (!opts.interactive) {
        throw new Error(`De site toont een ${blocked}-controle. Draai de app lokaal (node app.js), dan opent er een Chrome-venster waarin je die zelf oplost.`);
      }
      // Overstappen op een zichtbaar venster: de gebruiker lost de controle op, daarna gaat de run daar verder
      log(`⏸ ${blocked}-controle gevonden: los die op in het Chrome-venster dat nu opent (max. 5 min)`);
      if (opts.onWaiting) await opts.onWaiting(true);
      await browser.close();
      browser = await launchBrowser({ headless: false });
      visible = true;
      ({ context, page } = await openSite(browser, { mobile, ctxDsf, visible }));
      await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.bringToFront().catch(() => {});
      await waitForHuman(page);
      if (opts.onWaiting) await opts.onWaiting(false);
      log('▶ controle opgelost, verder in het zichtbare venster');
      ({ blocked } = await preparePage(page, config.url, log));
      if (blocked) throw new Error(`De site toont nog steeds een ${blocked}-controle`);
    }

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
        const catResponse = await catPage.goto(config.catalogUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await catPage.waitForTimeout(2000);
        const catBlocked = await detectBlock(catPage, catResponse);
        if (catBlocked && visible) {
          log(`⏸ ${catBlocked}-controle op de categoriepagina: los die op in het Chrome-venster`);
          await catPage.bringToFront().catch(() => {});
          if (opts.onWaiting) await opts.onWaiting(true);
          await waitForHuman(catPage);
          if (opts.onWaiting) await opts.onWaiting(false);
        }
        if (catBlocked && !visible) {
          log(`  ⚠ categoriepagina toont een ${catBlocked}-controle, overgeslagen`);
        } else {
          await catPage.evaluate(async () => {
            for (let y = 0; y < 3000; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 150)); }
            window.scrollTo(0, 0);
          });
          const extra = await catPage.evaluate(scrapeProducts);
          const seen = new Set(recommendations.map(r => r.url));
          recommendations.push(...extra.filter(r => !seen.has(r.url) && r.url !== config.url));
          log(`  ↳ ${extra.length} producten van de categoriepagina, totaal ${recommendations.length}`);
        }
      } finally {
        await catPage.close();
      }
    }
    if (recommendations.length < 4) {
      log('  ⚠ minder dan 4 producten gevonden — vul "recommendations" of "catalogUrl" aan in de config');
    }
    // voorkeur voor producten mét prijs (geloofwaardiger carrousel)
    recommendations.sort((a, b) => (b.price ? 1 : 0) - (a.price ? 1 : 0));

    // Onderdelen op de checkoutpagina (alleen met een checkoutUrl). De AI schrijft er per profiel teksten voor.
    let dealsOn = !!config.checkoutUrl && rawConfig.checkoutDeals !== false;
    const mailOn = !!config.checkoutUrl && rawConfig.mailCart !== false;
    let dealProducts = [];
    if (dealsOn) {
      const count = Math.min(Math.max(parseInt((rawConfig.checkoutDeals || {}).count, 10) || DEFAULTS.checkoutDeals.count, 3), 12);
      // Kassakoopjes = de goedkoopste producten (met prijs) die we vonden, niet het product van de PDP zelf
      const pdpPrice = parsePrice(facts.price);
      const pool = recommendations.filter(r => r.img && r.title && r.url !== config.url)
        .map(r => ({ ...r, n: parsePrice(r.price) }));
      pool.sort((a, b) => (a.n == null) - (b.n == null) || (a.n || 0) - (b.n || 0));
      const cheaper = pdpPrice ? pool.filter(r => r.n != null && r.n < pdpPrice) : [];
      dealProducts = (cheaper.length >= count ? cheaper : pool).slice(0, count).map(({ n, ...r }) => r);
      if (dealProducts.length < 3) {
        log('  ⚠ te weinig producten voor de kassakoopjes (minder dan 3): vul "catalogUrl" of "recommendations" aan. Kassakoopjes overgeslagen');
        dealsOn = false;
      }
    }
    const checkoutParts = { deals: dealsOn, mail: mailOn };

    // Bezoekersprofielen: eigen/eerder gemaakte (uit de webapp) > door de AI bedacht > één standaardversie
    let generated = null, profiles = null, refineStep = null;
    if (Array.isArray(rawConfig.profiles) && rawConfig.profiles.length) {
      profiles = rawConfig.profiles.map(sanitizeProfile).filter(Boolean).slice(0, 3);
      generated = rawConfig.persona ? { productType: rawConfig.persona.productType || '', persona: rawConfig.persona } : null;
      if (rawConfig.refine) {
        // doorprompten: de AI past de bestaande profielen aan op de instructie van de gebruiker
        const refined = await refineProfiles(config.name, facts, DEFAULTS, { profiles, instruction: rawConfig.refine, brief: rawConfig.instructions, chat: rawConfig.chat, checkout: checkoutParts }, log);
        if (refined) profiles = refined.profiles;
        refineStep = { prompt: rawConfig.refine, summary: refined ? refined.summary : 'De AI kon deze aanpassing niet doorvoeren; de vorige versie is behouden.' };
      } else {
        log(`  ↳ ${profiles.length} profiel(en) uit eerdere run/eigen aanpassing, geen nieuwe AI-tekst`);
      }
    } else if (config.autoCopy !== false) {
      generated = await generateProfiles(config.name, facts, DEFAULTS, { count: rawConfig.profileCount, hints: rawConfig.profileHints, instructions: rawConfig.instructions, checkout: checkoutParts }, log);
      profiles = generated && generated.profiles;
    }
    if (!profiles || !profiles.length) profiles = [DEFAULT_PROFILE];

    // --- Eén versie renderen op een (verse) pagina: injecteren, screenshots, crops, one-pager ---
    const renderVariant = async (vpage, cfg, prefix, profile, extraCrops = {}) => {
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
        stockAlert: cfg.stockAlert || null,
        priceNumber: parsePrice(facts.price),
        carousel: cfg.carousel || null,
        recommendations,
      });
      const placement = injected && injected.placement;
      if (placement) log(`  ↳ carrousel geplaatst: ${placement}`);
      if (injected && injected.storyPlacement) log(`  ↳ story-rij geplaatst: ${injected.storyPlacement}`);
      let stockAlertPlacement = (injected && injected.stockAlertPlacement) || null;
      if (cfg.stockAlert) {
        // Controle: met het onderdeel aan mag een run nooit eindigen zonder voorraadmelding
        const present = await vpage.evaluate(() => !!(document.getElementById('pim-demo-stockalert-btn') && document.getElementById('pim-demo-stockalert-popup'))).catch(() => false);
        if (!present) {
          for (const id of ['pim-demo-stockalert-wrap', 'pim-demo-stockalert-popup', 'pim-demo-stockalert-backdrop']) {
            await vpage.evaluate(i => { const e = document.getElementById(i); if (e) e.remove(); }, id).catch(() => {});
          }
          // twemoji uit: anders krijgen de bestaande badges een tweede ⚡
          await vpage.evaluate(injectOverlay, { accent, brand, twemoji: false, brandName: config.name, badgeText: config.badgeText, stockAlert: cfg.stockAlert, stockAlertFloat: true });
          stockAlertPlacement = 'zwevend rechtsonder (vangnet)';
          log('  ⚠ voorraadmelding niet in de pagina-opbouw geplaatst, zwevend toegevoegd');
        }
        log(`  ↳ voorraadmelding geplaatst: ${stockAlertPlacement}`);
      }
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
        // zwevende voorraadmelding: vastzetten op de plek waar hij in het eerste beeld stond
        const sa = document.querySelector('[data-pim-floating]');
        if (sa) { const r = sa.getBoundingClientRect(); sa.style.position = 'absolute'; sa.style.top = `${Math.round(r.top + window.scrollY)}px`; sa.style.bottom = 'auto'; }
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

      // --- Voorraadmelding: knop-crop, PDP met geopende popup en popup-crop ---
      if (cfg.stockAlert) {
        try {
          await vpage.evaluate(() => { for (const id of ['pim-demo-popup', 'pim-demo-backdrop']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; } });
          const btn = vpage.locator('#pim-demo-stockalert-wrap').first();
          await btn.scrollIntoViewIfNeeded();
          await vpage.waitForTimeout(200);
          const pBtn = f('03-detail-stockalert-knop.png');
          await btn.screenshot({ path: pBtn });
          crops.stockalertBtn = pBtn;
          log(`  ✓ ${path.basename(pBtn)}`);
          // knop ongeveer midden in beeld, daarna de popup openen
          await vpage.evaluate(() => {
            const b = document.getElementById('pim-demo-stockalert-btn');
            if (b) { const r = b.getBoundingClientRect(); window.scrollTo(0, Math.max(0, r.top + window.scrollY - window.innerHeight * 0.45)); }
            for (const id of ['pim-demo-stockalert-backdrop', 'pim-demo-stockalert-popup']) { const e = document.getElementById(id); if (e) e.style.display = ''; }
          });
          await vpage.waitForTimeout(300);
          const pShot = f('04-stockalert.png');
          await viewportShot(vpage, pShot, log);
          log(`  ✓ ${path.basename(pShot)}`);
          const pPop = f('03-detail-stockalert.png');
          await vpage.locator('#pim-demo-stockalert-popup').screenshot({ path: pPop });
          crops.stockalert = pPop;
          log(`  ✓ ${path.basename(pPop)}`);
        } catch (err) {
          log(`  ⚠ screenshots voorraadmelding mislukt (${String(err.message).split('\n')[0].slice(0, 120)})`);
        } finally {
          await vpage.evaluate(() => { for (const id of ['pim-demo-stockalert-backdrop', 'pim-demo-stockalert-popup']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; } }).catch(() => {});
        }
      }

      Object.assign(crops, extraCrops); // kassakoopjes / mail mijn winkelwagen van de checkoutpagina van dit profiel

      // --- One-pager ---
      await buildOnePager(browser, {
        config, accent, outDir, log, prefix,
        profile: prefix ? profile : null,
        shots: { popup: shotPopup, fullpage: shotFull, crops },
      });
      return { placement: placement || null, storyPlacement: (injected && injected.storyPlacement) || null, stockAlertPlacement };
    };

    // Kopie van een geladen pagina (zonder scripts, met <base> voor de juiste links) en die kopie weer openen.
    const snapshotOf = pg => pg.evaluate(url => {
      const html = document.documentElement.cloneNode(true);
      html.querySelectorAll('script, noscript').forEach(e => e.remove());
      const head = html.querySelector('head');
      if (head && !head.querySelector('base')) { const b = document.createElement('base'); b.href = url; head.prepend(b); }
      return '<!doctype html>' + html.outerHTML;
    }, pg.url()).catch(() => null);
    const openSnapshot = async html => {
      const sp = await context.newPage();
      const scdp = await context.newCDPSession(sp);
      await scdp.send('Emulation.setScriptExecutionDisabled', { value: true });
      await sp.setContent(html, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
      await sp.waitForTimeout(800);
      return sp;
    };

    // --- Checkout-/winkelwagenpagina (optioneel): per profiel een eigen versie met de teksten van dat profiel ---
    // Eerst één keer het product in de winkelwagen leggen en de pagina laden; die eerste pagina is voor profiel 1,
    // de volgende profielen laden hem opnieuw (of, bij een bot-controle, gebruiken ze een kopie van de eerste keer).
    let checkoutPage = null, checkoutSnapshot = null;
    if (config.checkoutUrl && !dealsOn && !mailOn) log('  ↳ checkoutpagina opgegeven, maar kassakoopjes en "mail mijn winkelwagen" staan uit: overgeslagen');
    if (config.checkoutUrl && (dealsOn || mailOn)) {
      log(`▶ checkoutpagina: ${config.checkoutUrl}`);
      try {
        await addProductToCart(context, config.url, (pg, u) => preparePage(pg, u, log), log);
        checkoutPage = await context.newPage();
        let { blocked } = await preparePage(checkoutPage, config.checkoutUrl, log);
        if (blocked && visible) {
          log(`⏸ ${blocked}-controle op de checkoutpagina: los die op in het Chrome-venster`);
          await checkoutPage.bringToFront().catch(() => {});
          if (opts.onWaiting) await opts.onWaiting(true);
          await waitForHuman(checkoutPage);
          if (opts.onWaiting) await opts.onWaiting(false);
          ({ blocked } = await preparePage(checkoutPage, config.checkoutUrl, log));
        }
        if (blocked) throw new Error(`de checkoutpagina toont een ${blocked}-controle`);
        const empty = await checkoutPage.evaluate(() => /winkel(wagen|mand) is leeg|je hebt nog geen|geen producten in|your (cart|bag) is empty|cart is empty/i.test(document.body.innerText || '')).catch(() => false);
        if (empty) log('  ⚠ de winkelwagen lijkt leeg: het product kon niet automatisch worden toegevoegd (de onderdelen staan er wel op)');
        if (profiles.length > 1) checkoutSnapshot = await snapshotOf(checkoutPage);
      } catch (err) {
        log(`  ⚠ checkoutpagina overgeslagen (${String(err.message).split('\n')[0].slice(0, 160)})`);
        if (checkoutPage) await checkoutPage.close().catch(() => {});
        checkoutPage = null;
      }
    }

    // Eén checkoutversie renderen voor een profiel. Geeft { crops, checkoutPlacement, mailCartPlacement } terug.
    const renderCheckout = async (cpage, cfg, prefix) => {
      const out = { crops: {}, checkoutPlacement: null, mailCartPlacement: null };
      const deals = cfg.checkoutDeals && dealsOn ? { title: cfg.checkoutDeals.title, products: dealProducts } : null;
      const mailCart = cfg.mailCart || null;
      if (!deals && !mailCart) return out;
      await cpage.evaluate(installBlocks);
      const ccdp = await context.newCDPSession(cpage);
      await ccdp.send('Emulation.setScriptExecutionDisabled', { value: true });
      const inj = await cpage.evaluate(injectOverlay, {
        accent, brand, twemoji, brandName: config.name, badgeText: config.badgeText,
        checkoutDeals: deals, mailCart,
      });
      out.checkoutPlacement = (inj && inj.checkoutPlacement) || null;
      out.mailCartPlacement = (inj && inj.mailCartPlacement) || null;
      if (deals) log(`  ↳ ${dealProducts.length} kassakoopjes geplaatst: ${out.checkoutPlacement || '?'}`);
      if (mailCart) log(`  ↳ "mail mijn winkelwagen" geplaatst: ${out.mailCartPlacement || '?'}`);
      if (twemoji) await cpage.waitForFunction(() => Array.from(document.images).every(i => i.complete), null, { timeout: 8000 }).catch(() => {});
      await cpage.waitForTimeout(800);
      const cf = n => path.join(outDir, `${prefix}checkout-${n}`);
      const done = n => log(`  ✓ ${prefix}checkout-${n}`);
      await cpage.evaluate(() => window.scrollTo(0, 0));
      // sticky/fixed elementen van de site neutraliseren (zoals bij de PDP-fullpage); een zwevende
      // knop van ons vastzetten op de plek waar hij in het eerste beeld stond
      await cpage.evaluate(() => {
        for (const el of document.querySelectorAll('[data-pim-floating]')) {
          const r = el.getBoundingClientRect(); el.style.position = 'absolute'; el.style.top = `${Math.round(r.top + window.scrollY)}px`; el.style.bottom = 'auto';
        }
        for (const el of document.querySelectorAll('body *')) {
          if (el.className && String(el.className).includes('pim-demo')) continue;
          const st = getComputedStyle(el);
          if (st.position === 'fixed' && st.display !== 'none') el.style.setProperty('display', 'none', 'important');
          else if (st.position === 'sticky') el.style.setProperty('position', 'static', 'important');
        }
      });
      await stitchFullPage(cpage, browser, cf('02-fullpage.png'), ctxDsf, log);
      done('02-fullpage.png');

      if (deals) {
        // beeld zoals een bezoeker het ziet: de kassakoopjes in beeld, met de winkelwagen erboven
        await cpage.evaluate(() => {
          const el = document.getElementById('pim-demo-kassakoopjes');
          if (el) { const r = el.getBoundingClientRect(); window.scrollTo(0, Math.max(0, r.top + window.scrollY - window.innerHeight * 0.5)); }
        });
        await cpage.waitForTimeout(400);
        await viewportShot(cpage, cf('01-kassakoopjes.png'), log);
        done('01-kassakoopjes.png');
        const sec = cpage.locator('#pim-demo-kassakoopjes').first();
        if (await sec.count()) {
          await sec.scrollIntoViewIfNeeded();
          await cpage.waitForTimeout(200);
          await sec.screenshot({ path: cf('03-detail-kassakoopjes.png') });
          out.crops.kassakoopjes = cf('03-detail-kassakoopjes.png');
          done('03-detail-kassakoopjes.png');
        }
      }

      if (mailCart) {
        try {
          const btn = cpage.locator('#pim-demo-mailcart-wrap').first();
          await btn.scrollIntoViewIfNeeded();
          await cpage.waitForTimeout(200);
          await btn.screenshot({ path: cf('03-detail-mailcart-knop.png') });
          done('03-detail-mailcart-knop.png');
          // knop ongeveer midden in beeld, daarna de popup openen
          await cpage.evaluate(() => {
            const b = document.getElementById('pim-demo-mailcart-btn');
            if (b) { const r = b.getBoundingClientRect(); window.scrollTo(0, Math.max(0, r.top + window.scrollY - window.innerHeight * 0.45)); }
            for (const id of ['pim-demo-mailcart-backdrop', 'pim-demo-mailcart-popup']) { const e = document.getElementById(id); if (e) e.style.display = ''; }
          });
          await cpage.waitForTimeout(300);
          await viewportShot(cpage, cf('04-mailcart.png'), log);
          done('04-mailcart.png');
          await cpage.locator('#pim-demo-mailcart-popup').screenshot({ path: cf('03-detail-mailcart.png') });
          out.crops.mailcart = cf('03-detail-mailcart.png');
          done('03-detail-mailcart.png');
        } catch (err) {
          log(`  ⚠ screenshots "mail mijn winkelwagen" mislukt (${String(err.message).split('\n')[0].slice(0, 120)})`);
        }
      }
      return out;
    };

    // Kopie van de geanalyseerde, nog onaangeroerde pagina. Blokkeert de site het opnieuw laden voor een
    // volgend profiel (bijv. Cloudflare), dan wordt die versie van deze kopie gemaakt in plaats van de controlepagina.
    const snapshot = profiles.length > 1 ? await snapshotOf(page) : null;

    const results = [];
    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      const prefix = profiles.length > 1 ? `v${i + 1}-` : '';
      const cfg = mergeProfileConfig(rawConfig, profile);
      if (profiles.length > 1) log(`▶ versie ${i + 1} van ${profiles.length}: ${profile.name}`);
      let vpage = page;
      if (i > 0) { // de eerste versie hergebruikt de geanalyseerde pagina; de rest krijgt een verse, onaangeroerde pagina
        vpage = await context.newPage();
        let { blocked } = await preparePage(vpage, config.url, log);
        if (blocked && visible) {
          log(`⏸ ${blocked}-controle bij versie ${i + 1}: los die op in het Chrome-venster`);
          await vpage.bringToFront().catch(() => {});
          if (opts.onWaiting) await opts.onWaiting(true);
          await waitForHuman(vpage).catch(() => {});
          if (opts.onWaiting) await opts.onWaiting(false);
          ({ blocked } = await preparePage(vpage, config.url, log));
        }
        if (blocked) {
          // nooit een screenshot van een controlepagina: verder met de kopie van de eerste keer laden
          await vpage.close().catch(() => {});
          if (!snapshot) { log(`  ⚠ ${blocked}-controle bij opnieuw laden en geen kopie van de pagina: versie ${i + 1} overgeslagen`); continue; }
          log(`  ⚠ ${blocked}-controle bij opnieuw laden: versie ${i + 1} gemaakt van de eerder opgehaalde pagina`);
          vpage = await openSnapshot(snapshot);
          if (await detectBlock(vpage, null)) {
            await vpage.close().catch(() => {});
            log(`  ⚠ ook de kopie toont een ${blocked}-controle: versie ${i + 1} overgeslagen`);
            continue;
          }
        }
        await vpage.evaluate(installBlocks);
      }
      // checkoutpagina van dit profiel (eerste profiel: de al geladen pagina; daarna opnieuw laden of de kopie)
      let co = { crops: {}, checkoutPlacement: null, mailCartPlacement: null };
      if (checkoutPage && (cfg.checkoutDeals || cfg.mailCart)) {
        let cpage = null;
        try {
          if (i === 0) cpage = checkoutPage;
          else {
            cpage = await context.newPage();
            const { blocked } = await preparePage(cpage, config.checkoutUrl, log);
            if (blocked) {
              await cpage.close().catch(() => {});
              cpage = null;
              if (checkoutSnapshot) {
                log(`  ⚠ ${blocked}-controle bij opnieuw laden van de checkoutpagina: kopie van de eerste keer gebruikt`);
                cpage = await openSnapshot(checkoutSnapshot);
              } else log(`  ⚠ ${blocked}-controle op de checkoutpagina: checkout voor versie ${i + 1} overgeslagen`);
            }
          }
          if (cpage) co = await renderCheckout(cpage, cfg, prefix);
        } catch (err) {
          log(`  ⚠ checkoutpagina voor versie ${i + 1} overgeslagen (${String(err.message).split('\n')[0].slice(0, 160)})`);
        } finally {
          if (cpage) await cpage.close().catch(() => {});
        }
      }
      try {
        results.push({ profile, cfg, prefix, co, info: await renderVariant(vpage, cfg, prefix, profile, co.crops) });
      } finally {
        if (i > 0) await vpage.close().catch(() => {});
      }
    }
    if (checkoutPage && !checkoutPage.isClosed()) await checkoutPage.close().catch(() => {});

    fs.writeFileSync(path.join(outDir, 'persona.json'), JSON.stringify({
      facts,
      generated: generated ? { productType: generated.productType, persona: generated.persona } : null,
      profiles: results.map(r => ({
        key: r.profile.key, name: r.profile.name, description: r.profile.description, signals: r.profile.signals,
        changes: r.profile.changes, show: r.profile.show, copy: r.cfg, prefix: r.prefix,
      })),
      meta: {
        accent, accentSource, palette: brand.palette,
        placement: results[0].info.placement, storyPlacement: results[0].info.storyPlacement, stockAlertPlacement: results[0].info.stockAlertPlacement,
        checkoutPlacement: (results[0].co || {}).checkoutPlacement || null, mailCartPlacement: (results[0].co || {}).mailCartPlacement || null,
        // wat de gebruiker de AI heeft gevraagd: de beginopdracht en het gesprek tot nu toe (met wat de AI per stap deed)
        instructions: rawConfig.instructions || '',
        chat: [...(rawConfig.chat || []), ...(refineStep ? [refineStep] : [])].slice(-8),
        // compacte sectielijst voor het keuzemenu "Plaatsing" in de webapp
        outline: outline.sections.map(s => ({ i: s.i, label: (s.heading || s.hint || 'sectie').slice(0, 50) })),
      },
    }, null, 2));

    log('✔ Klaar');
  } finally {
    await browser.close();
  }
}

module.exports = { runDemo, slugify, DEFAULTS, viewportShot, detectBlock };
