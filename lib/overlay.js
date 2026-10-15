// Draait in de browser-context via page.evaluate(injectOverlay, payload).
// Moet volledig self-contained zijn: geen referenties naar Node-scope.
function injectOverlay(payload) {
  const { accent, brandName, popup, stickyBar, socialProof, carousel, recommendations, badgeText } = payload;
  // Huisstijl van de prospect (alles optioneel; fallback = neutrale standaardstijl)
  const brand = payload.brand || {};
  const SYS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const font = brand.font || SYS;
  const headFont = brand.headingFont || font;
  const ink = brand.ink || '${ink}';
  const barBg = brand.barBg || ink;
  const pageBg = brand.pageBg || '#fff';
  const btnR = brand.btnRadius || '8px';
  const btnText = brand.btnText || '#fff';
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

    /* ---- Social proof ---- */
    .${ns}-socialproof {
      display: inline-flex; align-items: center; gap: 8px; margin: 14px 0;
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
      font-size: 13px; font-weight: 700;
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
    badge.style.cssText += `position: fixed; top: 46px; left: 16px; z-index: 99997;`;
    badge.id = `${ns}-stickybar-badge`;
    document.body.appendChild(badge);
    bar.style.outline = `3px dashed ${accent}`;
    bar.style.outlineOffset = '-3px';
  }

  // ---- Social proof: vind de koopknop ----
  if (socialProof) {
    const btnTexts = /in winkelwagen|winkelmand|toevoegen|add to cart|add to bag|bestel|koop|kopen|in mijn|reserveer/i;
    let buyBtn = null;
    const candidates = Array.from(document.querySelectorAll('button, a[role="button"], input[type="submit"], a.button, a.btn'));
    for (const b of candidates) {
      const t = (b.innerText || b.value || '').trim();
      if (t && t.length < 60 && btnTexts.test(t) && b.offsetParent !== null) { buyBtn = b; break; }
    }
    const pill = document.createElement('div');
    pill.className = `${ns}-socialproof`;
    pill.innerHTML = `🔥 ${socialProof.text}`;
    if (buyBtn) {
      const holder = document.createElement('div');
      holder.appendChild(pill);
      buyBtn.parentNode.insertBefore(holder, buyBtn);
      addBadge(holder);
    } else {
      const h1 = document.querySelector('h1');
      if (h1) { h1.parentNode.insertBefore(pill, h1.nextSibling); addBadge(pill); }
    }
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

    // Plaatsing: als SIBLING ná <main> (niet erbinnen — mutaties in de subtree van
    // een gehydrateerde app-container kunnen de hele pagina blank laten renderen),
    // anders vóór de footer, anders einde body
    const main = document.querySelector('main');
    const footer = document.querySelector('footer');
    if (main) main.insertAdjacentElement('afterend', section);
    else if (footer) footer.parentNode.insertBefore(section, footer);
    else document.body.appendChild(section);
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

  return true;
}

module.exports = { injectOverlay };
