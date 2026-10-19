// Draait in de browser-context via page.evaluate(injectOverlay, payload).
// Moet volledig self-contained zijn: geen referenties naar Node-scope.
function injectOverlay(payload) {
  const { accent, brandName, popup, stickyBar, socialProof, loyalty, storyRow, priceNumber, carousel, recommendations, badgeText } = payload;
  // Huisstijl van de prospect (alles optioneel; fallback = neutrale standaardstijl)
  const brand = payload.brand || {};
  const SYS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const font = brand.font || SYS;
  const headFont = brand.headingFont || font;
  const ink = brand.ink || '#1a1f2b';
  const barBg = brand.barBg || ink;
  const pageBg = brand.pageBg || '#fff';
  const btnR = brand.btnRadius || '8px';
  // Knoptekst: die van de site, anders zwart of wit afhankelijk van de accentkleur
  const toRgb = c => {
    const m = String(c).match(/^#([0-9a-f]{6})$/i);
    if (m) return [0, 2, 4].map(i => parseInt(m[1].substr(i, 2), 16));
    const n = String(c).match(/[\d.]+/g);
    return n ? n.slice(0, 3).map(Number) : [0, 0, 0];
  };
  const relLum = rgb => rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const btnText = brand.btnText || (relLum(toRgb(accent)) > 0.5 ? '#111' : '#fff');
  let placement = null;
  const btnExtra = `text-transform: ${brand.btnTransform || 'none'}; ${brand.btnWeight ? 'font-weight: ' + brand.btnWeight + ';' : ''} ${brand.btnLetterSpacing ? 'letter-spacing: ' + brand.btnLetterSpacing + ';' : ''}`;

  const ns = 'pim-demo';
  const style = document.createElement('style');
  style.textContent = `
    /* Scoped reset: voorkom dat host-CSS (extreme line-heights, margins, floats)
       onze geïnjecteerde elementen opblaast. Onze eigen regels hieronder winnen
       door cascade-volgorde. */
    [class*="${ns}"], [class*="${ns}"] * {
      all: revert;
      box-sizing: border-box;
    }
    /* Let op: GEEN z-index op deze wrap — een stacking context op een groot
       in-flow element triggert op sommige sites (o.a. DeOnlineDrogist) een
       Chromium compositor-bug waardoor de omliggende pagina wit rendert. */
    .${ns}-wrap { position: relative; font-family: ${font}; }
    .${ns}-marker { outline: 3px dashed ${accent}; outline-offset: 6px; border-radius: 4px; }
    .${ns}-badge {
      position: absolute; top: -34px; left: -6px; z-index: 11;
      background: ${accent}; color: #fff; font-size: 12px; font-weight: 700;
      letter-spacing: .02em; padding: 5px 12px; border-radius: 999px;
      box-shadow: 0 2px 8px rgba(0,0,0,.25); white-space: nowrap;
      font-family: ${font};
    }
    .${ns}-badge::before { content: '⚡ '; }

    /* ---- Popup ---- */
    .${ns}-backdrop {
      position: fixed; inset: 0; background: rgba(10, 15, 30, .55);
      z-index: 99998;
    }
    .${ns}-popup {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 460px; max-width: calc(100vw - 40px); background: #fff; border-radius: 16px;
      box-shadow: 0 24px 80px rgba(0,0,0,.35); z-index: 100000; overflow: visible;
      font-family: ${font};
    }
    .${ns}-popup-head { background: ${accent}; border-radius: 16px 16px 0 0; padding: 28px 32px 22px; color: #fff; }
    .${ns}-popup-head h2 { font-family: ${headFont}; margin: 0 0 6px; font-size: 26px; line-height: 1.15; font-weight: 800; color:#fff; }
    .${ns}-popup-head p { margin: 0; font-size: 15px; opacity: .92; color:#fff; }
    .${ns}-popup-body { padding: 24px 32px 28px; }
    .${ns}-popup-input {
      display: flex; gap: 8px; margin-bottom: 14px;
    }
    .${ns}-popup-input input {
      flex: 1; border: 1.5px solid #d5d9e0; border-radius: 8px; padding: 12px 14px;
      font-family: ${font}; font-size: 14px; color: #8a919c; background: #fff;
    }
    .${ns}-popup-cta {
      display: block; width: 100%; background: ${accent}; font-family: ${font}; color: ${btnText}; ${btnExtra} border: none;
      border-radius: ${btnR}; padding: 14px; font-size: 15px; font-weight: 700; cursor: pointer;
    }
    .${ns}-popup-code {
      margin-top: 14px; text-align: center; font-size: 13px; color: #5a6270;
    }
    .${ns}-popup-code b { color: ${ink}; background: #f1f3f6; border: 1px dashed #b9c0cc; padding: 2px 8px; border-radius: 6px; letter-spacing: .06em; }
    .${ns}-popup-close {
      position: absolute; top: 14px; right: 16px; width: 28px; height: 28px; border-radius: 50%;
      background: rgba(255,255,255,.25); color: #fff; font-size: 15px; line-height: 28px;
      text-align: center; font-weight: 600;
    }

    /* ---- Carousel ---- */
    .${ns}-carousel-section {
      max-width: 1200px; margin: 48px auto; padding: 0 24px; position: relative;
      font-family: ${font};
    }
    .${ns}-carousel-inner { position: relative; padding: 24px; background: ${pageBg}; border-radius: 12px; }
    .${ns}-carousel-title { font-family: ${headFont}; font-size: 22px; line-height: 1.3; font-weight: 800; margin: 0 0 18px; color: ${ink}; }
    .${ns}-cards { display: flex; gap: 16px; overflow: hidden; }
    .${ns}-card {
      flex: 0 0 calc(25% - 12px); background: ${pageBg}; border: 1px solid #e6e9ee; border-radius: 10px;
      overflow: hidden; display: flex; flex-direction: column;
    }
    .${ns}-card-img { width: 100%; aspect-ratio: 1 / 1; object-fit: contain; background: #fff; display: block; }
    .${ns}-card-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
    .${ns}-card-title {
      font-size: 13.5px; font-weight: 600; color: ${ink}; line-height: 1.35; margin: 0;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.7em;
    }
    .${ns}-card-price { font-size: 15px; font-weight: 800; color: ${ink}; margin-top: auto; }
    .${ns}-card-cta {
      margin-top: 8px; background: ${accent}; font-family: ${font}; color: ${btnText}; ${btnExtra} border: none; border-radius: ${btnR};
      padding: 9px 0; font-size: 13px; font-weight: 700; text-align: center;
    }
    .${ns}-arrow {
      position: absolute; top: 50%; transform: translateY(-50%); width: 40px; height: 40px;
      border-radius: 50%; background: #fff; box-shadow: 0 3px 12px rgba(0,0,0,.18);
      font-size: 18px; line-height: 40px; text-align: center; color: ${ink}; z-index: 2;
    }

    /* ---- Story-rij (productaanbevelingen als ronde "stories") ---- */
    .${ns}-story { max-width: 1200px; margin: 0 auto; padding: 14px 12px 10px; font-family: ${font}; }
    .${ns}-story-row { display: flex; gap: 16px; overflow: hidden; }
    .${ns}-story-item { flex: 0 0 96px; text-align: center; }
    .${ns}-story-ring {
      width: 84px; height: 84px; margin: 0 auto 7px; padding: 3px; border-radius: 50%;
      border: 2.5px solid ${accent}; background: #fff; box-sizing: border-box;
    }
    .${ns}-story-ring img { display: block; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; object-position: center top; background: #f1f1f1; }
    .${ns}-story-label {
      font-size: 12px; line-height: 1.25; color: ${ink};
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    @media (max-width: 640px) {
      .${ns}-story { padding: 10px 8px 8px; }
      .${ns}-story-row { gap: 10px; }
      .${ns}-story-item { flex-basis: 76px; }
      .${ns}-story-ring { width: 66px; height: 66px; }
      .${ns}-story-label { font-size: 11px; }
      .${ns}-carousel-section { margin: 28px auto; padding: 0 12px; }
      .${ns}-carousel-inner { padding: 14px; }
      .${ns}-card { flex-basis: calc(50% - 8px); }
      .${ns}-cards { gap: 12px; }
      .${ns}-stickybar { font-size: 12px; gap: 8px; padding: 9px 10px; }
      .${ns}-popup-head { padding: 22px 22px 18px; }
      .${ns}-popup-body { padding: 20px 22px 24px; }
    }

    /* ---- Spaarpunten ---- */
    .${ns}-loyalty {
      background: color-mix(in srgb, ${accent} 12%, white); border-radius: 6px; padding: 14px 18px 12px;
      color: ${ink}; font-family: ${font}; font-size: 13.5px; line-height: 1.4; text-align: left;
    }
    .${ns}-loyalty-title { text-align: center; font-size: 14px; margin-bottom: 10px; }
    .${ns}-loyalty-title b, .${ns}-loyalty-have b { font-weight: 800; }
    .${ns}-loyalty-info {
      display: inline-block; width: 15px; height: 15px; border: 1.5px solid ${ink}; border-radius: 50%;
      font-size: 10px; line-height: 12px; text-align: center; font-weight: 700; vertical-align: 1px; margin-left: 3px;
    }
    .${ns}-loyalty-have { font-size: 12.5px; margin-bottom: 6px; }
    .${ns}-loyalty-acc { color: ${accent}; }
    .${ns}-loyalty-track {
      position: relative; height: 14px; border-radius: 999px; margin: 6px 12px 12px 0;
      background: color-mix(in srgb, ${accent} 22%, white);
    }
    .${ns}-loyalty-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px; background: color-mix(in srgb, ${accent} 45%, white); }
    .${ns}-loyalty-dot {
      position: absolute; top: 50%; width: 22px; height: 22px; border-radius: 50%; background: ${accent};
      border: 3px solid #fff; transform: translate(-50%, -50%); box-shadow: 0 1px 3px rgba(0,0,0,.25);
    }
    .${ns}-loyalty-star {
      position: absolute; top: 50%; width: 18px; height: 18px; transform: translate(-50%, -50%);
      background: color-mix(in srgb, ${accent} 55%, white);
      clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
    }
    .${ns}-loyalty-foot { font-size: 11.5px; color: color-mix(in srgb, ${ink} 70%, white); }

    /* ---- Social proof ---- */
    .${ns}-socialproof {
      display: flex; width: 100%; justify-content: center; align-items: center; gap: 8px; margin: 0;
      background: color-mix(in srgb, ${accent} 10%, white); border: 1px solid color-mix(in srgb, ${accent} 45%, white); color: ${ink};
      font-size: 13.5px; font-weight: 600; padding: 9px 16px; border-radius: 999px;
      font-family: ${font};
    }

    /* ---- Sticky bar ---- */
    .${ns}-stickybar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 99997;
      background: ${barBg}; color: #fff; display: flex; align-items: center; justify-content: center;
      gap: 14px; padding: 11px 20px; font-size: 14px; font-weight: 600;
      font-family: ${font};
    }
    .${ns}-stickybar-cta {
      background: ${accent}; font-family: ${font}; color: ${btnText}; ${btnExtra} border-radius: ${btnR === '0px' ? '0' : '999px'}; padding: 6px 16px;
      font-size: 13px; font-weight: 700; white-space: nowrap; flex: none;
    }
  `;
  document.head.appendChild(style);

  function addBadge(el, text) {
    el.classList.add(`${ns}-marker`);
    const badge = document.createElement('div');
    badge.className = `${ns}-badge`;
    badge.textContent = text || badgeText;
    const wrap = document.createElement('div');
    wrap.className = `${ns}-wrap`;
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);
    wrap.appendChild(badge);
    return wrap;
  }

  // ---- Sticky bar ----
  if (stickyBar) {
    const bar = document.createElement('div');
    bar.className = `${ns}-stickybar`;
    bar.id = `${ns}-stickybar`;
    bar.innerHTML = `<span>${stickyBar.text}</span>` +
      (stickyBar.cta ? `<span class="${ns}-stickybar-cta">${stickyBar.cta}</span>` : '');
    document.body.appendChild(bar);
    const badge = document.createElement('div');
    badge.className = `${ns}-badge`;
    badge.textContent = badgeText;
    // direct onder de balk, ook als de tekst op een smal scherm over twee regels loopt
    badge.style.cssText += `position: fixed; top: ${Math.round(bar.getBoundingClientRect().height) + 2}px; left: 16px; z-index: 99997;`;
    badge.id = `${ns}-stickybar-badge`;
    document.body.appendChild(badge);
    bar.style.outline = `3px dashed ${accent}`;
    bar.style.outlineOffset = '-3px';
  }

  // Zoekt de koopknop van het product en het "kolom-anker": het buitenste blok om de koopknop (of de hele
  // rij met aantal-veld + knop), zodat extra blokken er netjes onder/boven komen, over de volle kolombreedte.
  function findBuyAnchor() {
    const btnTexts = /in winkelwagen|winkelmand|toevoegen|add to cart|add to bag|bestel|koop|kopen|in mijn|reserveer/i;
    const h1 = document.querySelector('h1');
    const candidates = Array.from(document.querySelectorAll('button, a[role="button"], input[type="submit"], a.button, a.btn')).filter(b => {
      const t = (b.innerText || b.value || '').trim();
      return t && t.length < 60 && btnTexts.test(t) && b.offsetParent !== null;
    });
    // De koopknop van het product zelf: de eerste ná de h1 (niet een snelkoop-knop in een lijst erboven)
    const buyBtn = (h1 && candidates.find(b => h1.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)) || candidates[0] || null;
    let anchor = null;
    if (buyBtn) {
      anchor = buyBtn;
      // omhoog langs wrappers die alleen de knop bevatten (de knop zelf is vaak maar een deel van een vak)
      for (let i = 0; i < 4; i++) {
        const p = anchor.parentElement;
        if (!p || p === document.body || p.tagName === 'MAIN') break;
        const kids = Array.from(p.children).filter(c => c.getBoundingClientRect().height > 0);
        if (kids.length === 1) anchor = p; else break;
      }
      // staat de knop in een rij (aantal-veld + knop)? Dan is de hele rij het anker
      const row = anchor.parentElement;
      if (row && row !== document.body && row.tagName !== 'MAIN') {
        const cs = getComputedStyle(row);
        if (cs.display.includes('flex') && cs.flexDirection.startsWith('row') && row.children.length > 1) anchor = row;
      }
    }
    return { h1, buyBtn, anchor };
  }
  let spWrap = null; // de badge-wrapper van social proof, als die onder de koopknop staat (voor de plek van de spaarpunten)

  // ---- Social proof ----
  if (socialProof) {
    const { h1, buyBtn, anchor: ctaAnchor } = findBuyAnchor();

    // Plek: 'below-cta' (standaard) | 'above-cta' | 'below-title'. Altijd als eigen blok over de volle
    // breedte van de kolom, nooit als item in de rij naast de koopknop of het aantal-veld.
    const position = socialProof.position || 'below-cta';
    const pill = document.createElement('div');
    pill.className = `${ns}-socialproof`;
    pill.innerHTML = `🔥 ${socialProof.text}`;
    const holder = document.createElement('div');
    holder.style.cssText = 'width: 100%; box-sizing: border-box;';
    holder.appendChild(pill);

    let anchor = null, where = 'afterend';
    if (position === 'below-title' && h1) {
      anchor = h1;
    } else if (buyBtn && ctaAnchor) {
      anchor = ctaAnchor;
      if (position === 'above-cta') where = 'beforebegin';
    } else if (h1) {
      anchor = h1;
    }
    if (anchor) {
      anchor.insertAdjacentElement(where, holder);
      const wrap = addBadge(holder);
      // ruimte voor het label ("Geïnjecteerd door…") dat boven het blok hangt
      if (where === 'afterend') wrap.style.marginTop = '44px'; else wrap.style.marginBottom = '10px';
      if (where === 'afterend' && position === 'below-cta') spWrap = wrap;
    }
  }

  // ---- Spaarpunten (loyalty): "Je spaart X punten met dit artikel" + voortgangsbalk ----
  if (loyalty) {
    const nl = n => Number(n).toLocaleString('nl-NL');
    const ppe = Number(loyalty.pointsPerEuro) > 0 ? Number(loyalty.pointsPerEuro) : 1;
    const earn = Math.max(1, Math.round((priceNumber > 0 ? priceNumber : 50) * ppe));
    const have = Math.max(0, Math.round(Number(loyalty.currentPoints) || 0));
    const miles = (Array.isArray(loyalty.milestones) && loyalty.milestones.length ? loyalty.milestones : [750, 1000, 2000, 4000]).map(Number).filter(n => n > 0).sort((a, b) => a - b);
    const max = miles[miles.length - 1] || 1000;
    const pct = n => Math.min(100, Math.max(0, (n / max) * 100));
    const name = loyalty.programName || `${brandName} Members`;
    const milesText = miles.length > 1 ? `${miles.slice(0, -1).map(nl).join(', ')} of ${nl(miles[miles.length - 1])}` : nl(miles[0]);
    // Ster als CSS-vorm (clip-path): inline SVG-paden worden door de scoped reset (all: revert) leeggemaakt
    const stars = miles.map(m => `<span class="${ns}-loyalty-star" style="left:${pct(m)}%"></span>`).join('');
    const panel = document.createElement('div');
    panel.className = `${ns}-loyalty`;
    panel.innerHTML = `
      <div class="${ns}-loyalty-title">${name} sparen <b>${nl(earn)}</b> punten met dit artikel <span class="${ns}-loyalty-info">i</span></div>
      <div class="${ns}-loyalty-have">Je hebt <b class="${ns}-loyalty-acc">${nl(have)}</b> spaarpunten</div>
      <div class="${ns}-loyalty-track">
        <div class="${ns}-loyalty-fill" style="width:${Math.max(pct(have), 4)}%"></div>
        <span class="${ns}-loyalty-dot" style="left:${Math.max(pct(have), 4)}%"></span>
        ${stars}
      </div>
      <div class="${ns}-loyalty-foot">Verzilver je punten bij ${milesText} punten.</div>`;
    const holder = document.createElement('div');
    holder.style.cssText = 'width: 100%; box-sizing: border-box;';
    holder.appendChild(panel);

    // Onder de koopknop; staat social proof daar al, dan eronder met flink wat ruimte ertussen.
    const { h1, anchor: ctaAnchor } = findBuyAnchor();
    const target = spWrap && spWrap.isConnected ? spWrap : (ctaAnchor || h1);
    if (target) {
      target.insertAdjacentElement('afterend', holder);
      const wrap = addBadge(holder);
      wrap.style.marginTop = spWrap && spWrap.isConnected ? '72px' : '44px';
    }
  }

  // ---- Story-rij: ronde productplaatjes met ring, boven de vouw (onder breadcrumbs, boven de productfoto's) ----
  let storyPlacement = null;
  if (storyRow && recommendations && recommendations.length) {
    const count = Math.min(Math.max(parseInt(storyRow.count, 10) || 8, 4), 12);
    // liever andere producten dan de carrousel (die pakt de eerste vier)
    const pool = recommendations.length >= 4 + count ? recommendations.slice(4) : recommendations;
    const items = pool.slice(0, count).map(r => `
      <div class="${ns}-story-item">
        <div class="${ns}-story-ring"><img src="${r.img}" alt=""></div>
        <div class="${ns}-story-label">${r.title}</div>
      </div>`).join('');
    const story = document.createElement('div');
    story.className = `${ns}-story`;
    story.id = `${ns}-story`;
    story.innerHTML = `<div class="${ns}-story-row">${items}</div>`;
    const found = typeof window.__pimBlocks === 'function' ? window.__pimBlocks(ns) : { usable: [] };
    const usable = found.usable;
    // Boven de vouw: vóór het eerste "echte" blok (productfoto's of productinformatie), dus onder
    // header, zoekbalk en breadcrumbs. Kleine blokken (< 200 px) tellen als pagina-kop.
    const pIdx = usable.findIndex(b => b.querySelector('h1'));
    const upto = pIdx >= 0 ? pIdx : -1;
    const sIdx = upto >= 0 ? usable.findIndex((b, n) => n <= upto && (b.getBoundingClientRect().height >= 200 || b.querySelector('h1'))) : -1;
    if (sIdx >= 0) {
      usable[sIdx].insertAdjacentElement('beforebegin', story);
      storyPlacement = sIdx > 0 ? `boven de eerste productsectie, onder "${((usable[sIdx - 1].querySelector('h1,h2,h3,h4') || {}).innerText || 'de paginakop').trim().slice(0, 30)}"` : 'boven de eerste productsectie';
    } else {
      const h1 = document.querySelector('h1');
      const host = h1 && (h1.closest('section, [class*="product"], main > div') || h1.parentElement);
      if (host) { host.insertAdjacentElement('beforebegin', story); storyPlacement = 'boven de productkop'; }
      else { document.body.insertBefore(story, document.body.firstChild); storyPlacement = 'bovenaan de pagina'; }
    }
    const wrap = addBadge(story.firstElementChild);
    wrap.style.marginTop = '44px';
  }

  // Kiest een logische plek midden op de pagina voor de carrousel (geeft een beschrijving terug).
  // Volgorde: vóór bestaande aanbevelingen > na de reviews > na de productbeschrijving > ~55% van de pagina.
  function placeSection(section) {
    // Secties van de pagina: zelfde bepaling als voor de AI-outline (lib/blocks.js)
    const found = typeof window.__pimBlocks === 'function' ? window.__pimBlocks(ns) : { usable: [], footerEl: document.querySelector('footer') };
    const { usable, footerEl } = found;
    const abs = el => el.getBoundingClientRect().top + window.scrollY;
    const heading = b => { const h = b.querySelector('h1, h2, h3, h4'); return h ? h.innerText.replace(/\s+/g, ' ').trim() : ''; };
    const meta = b => `${b.id} ${b.className}`.toLowerCase();
    const REC = /anderen bekeken|ook bekeken|gerelateerd|vergelijkbaar|ook interessant|selectie voor jou|aanbevolen|misschien|vaak samen|you may also like|also viewed|complete the look|related|recommended|similar|cross-?sell|upsell|featured[-_]products/i;
    const RECENT = /eerder.*bekeken|recently[- ]viewed|laatst bekeken/i;
    const REV = /reviews?|beoordelingen|ervaringen/i;
    const text = b => `${heading(b)} ${meta(b)}`;
    const label = b => heading(b).slice(0, 40) || b.id.slice(0, 30) || b.tagName.toLowerCase();

    let desc = null;
    if (usable.length < 2) {
      if (footerEl) { footerEl.insertAdjacentElement('beforebegin', section); return 'vóór de footer (pagina-opbouw niet herkend)'; }
      document.body.appendChild(section); return 'einde pagina (pagina-opbouw niet herkend)';
    }
    // Gekozen plek (door een mens of de AI): { index, position: 'before' | 'after', source, reason }
    const pc = payload.placementChoice;
    if (pc && Number.isInteger(pc.index) && usable[pc.index]) {
      const target = usable[pc.index];
      const before = pc.position === 'before';
      target.insertAdjacentElement(before ? 'beforebegin' : 'afterend', section);
      desc = `${pc.source || 'gekozen'}: ${before ? 'vóór' : 'na'} "${label(target)}"${pc.reason ? ' — ' + pc.reason : ''}`;
    }
    let i = desc ? -1 : usable.findIndex((b, n) => n > 0 && !b.querySelector('h1') && REC.test(text(b)) && !RECENT.test(text(b)));
    if (i >= 0) { usable[i].insertAdjacentElement('beforebegin', section); desc = `vóór bestaande aanbevelingen ("${label(usable[i])}")`; }
    if (!desc) {
      i = usable.findIndex((b, n) => n > 0 && !b.querySelector('h1') && (REV.test(heading(b)) || /review/.test(meta(b))));
      if (i >= 0) { usable[i].insertAdjacentElement('afterend', section); desc = `na de reviews ("${label(usable[i])}")`; }
    }
    if (!desc) {
      i = usable.findIndex(b => b.querySelector('h1'));
      if (i >= 0) {
        const t = usable[Math.min(i + 1, usable.length - 1)];
        t.insertAdjacentElement('afterend', section);
        desc = `na de productinformatie ("${label(t)}")`;
      }
    }
    const middle = () => {
      const total = usable.reduce((s, b) => s + b.getBoundingClientRect().height, 0);
      let run = 0;
      for (const b of usable) { run += b.getBoundingClientRect().height; if (run >= total * 0.55) { b.insertAdjacentElement('afterend', section); return `midden van de pagina (na "${label(b)}")`; } }
      usable[usable.length - 1].insertAdjacentElement('afterend', section);
      return 'onderaan de content';
    };
    if (!desc) desc = middle();
    // vangnet: nooit onder de footer
    if (footerEl && abs(section) > abs(footerEl)) { section.remove(); desc = middle() + ' (vangnet)'; }
    return desc;
  }

  // ---- Carousel ----
  if (carousel && recommendations && recommendations.length) {
    const section = document.createElement('div');
    section.className = `${ns}-carousel-section`;
    section.id = `${ns}-carousel`;
    const cards = recommendations.slice(0, 4).map(r => `
      <div class="${ns}-card">
        <img class="${ns}-card-img" src="${r.img}" alt="">
        <div class="${ns}-card-body">
          <p class="${ns}-card-title">${r.title}</p>
          <div class="${ns}-card-price">${r.price || ''}</div>
          <div class="${ns}-card-cta">Bekijk product</div>
        </div>
      </div>`).join('');
    section.innerHTML = `
      <div class="${ns}-carousel-inner">
        <h2 class="${ns}-carousel-title">${carousel.title}</h2>
        <div class="${ns}-cards">${cards}</div>
        <div class="${ns}-arrow" style="left:8px;">‹</div>
        <div class="${ns}-arrow" style="right:8px;">›</div>
      </div>`;

    // Let op: de site-JS is bevroren vóór deze injectie (zie run.js), dus invoegen tússen de
    // secties van de pagina veroorzaakt geen re-render die onze content weggooit.
    placement = placeSection(section);
    addBadge(section.firstElementChild);
  }

  // ---- Popup ----
  if (popup) {
    const backdrop = document.createElement('div');
    backdrop.className = `${ns}-backdrop`;
    backdrop.id = `${ns}-backdrop`;
    const modal = document.createElement('div');
    modal.className = `${ns}-popup`;
    modal.id = `${ns}-popup`;
    modal.innerHTML = `
      <div class="${ns}-popup-close">✕</div>
      <div class="${ns}-popup-head">
        <h2>${popup.headline}</h2>
        <p>${popup.sub}</p>
      </div>
      <div class="${ns}-popup-body">
        <div class="${ns}-popup-input"><input value="jouw@emailadres.nl" readonly></div>
        <button class="${ns}-popup-cta">${popup.cta}</button>
        ${popup.code ? `<p class="${ns}-popup-code">Of gebruik direct code <b>${popup.code}</b></p>` : ''}
      </div>`;
    const badge = document.createElement('div');
    badge.className = `${ns}-badge`;
    badge.style.top = '-40px'; badge.style.left = '0';
    badge.textContent = badgeText;
    modal.appendChild(badge);
    modal.style.outline = `3px dashed ${accent}`;
    modal.style.outlineOffset = '8px';
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
  }

  // Serverless-Chromium heeft geen emoji-font (je ziet dan vierkantjes): vervang emoji in onze
  // eigen elementen door Twemoji-plaatjes. Alleen aan als payload.twemoji gezet is.
  if (payload.twemoji) {
    document.querySelectorAll(`.${ns}-badge`).forEach(b => b.insertBefore(document.createTextNode('⚡ '), b.firstChild));
    const css = document.createElement('style');
    css.textContent = `.${ns}-badge::before { content: none !important; } img.${ns}-emoji { height: 1.1em; width: 1.1em; vertical-align: -0.18em; display: inline-block; margin: 0 .08em; }`;
    document.head.appendChild(css);
    const re = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu;
    const roots = document.querySelectorAll(`[class*="${ns}"]`);
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const text = node.nodeValue;
        if (!re.test(text)) continue;
        re.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let last = 0, m;
        while ((m = re.exec(text))) {
          frag.append(text.slice(last, m.index));
          let cps = Array.from(m[0]).map(c => c.codePointAt(0).toString(16));
          if (!cps.includes('200d')) cps = cps.filter(c => c !== 'fe0f');
          const img = document.createElement('img');
          img.className = `${ns}-emoji`; img.alt = m[0];
          img.src = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${cps.join('-')}.svg`;
          frag.append(img);
          last = m.index + m[0].length;
        }
        frag.append(text.slice(last));
        node.replaceWith(frag);
      }
    }
  }

  return { placement, storyPlacement };
}

module.exports = { injectOverlay };
