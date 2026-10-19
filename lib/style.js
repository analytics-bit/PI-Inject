// Draait in de browser-context: leest de huisstijl van de pagina uit (accentkleur, palet,
// lettertype, kleuren, knopvorm) zodat de geïnjecteerde elementen er native uitzien.
// Moet volledig self-contained zijn. Geeft null-waardes terug als iets niet te vinden is.
function extractBrandStyle() {
  const parse = c => {
    const m = (c || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(',').map(s => parseFloat(s));
    return { r, g, b, a };
  };
  const chan = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
  const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const sat = c => { const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b); return mx === 0 ? 0 : (mx - mn) / mx; };
  const opaque = c => { const p = parse(c); return p && p.a > 0.9 ? p : null; };
  const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const rgb = c => c ? `rgb(${c.r}, ${c.g}, ${c.b})` : null;
  const visible = el => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 40 && r.height > 18 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  // "Merkachtig": opaak, niet (bijna) wit, en óf duidelijk gekleurd óf donker
  const brandish = c => c && lum(c) < 0.85 && (sat(c) > 0.2 || lum(c) < 0.25);

  // --- 1. De koopknop: zoek op tekst, daarna naar de kleur op het element zelf, de
  // ouders (knopformaat) of de kinderen. Veel shops zetten de kleur niet op de <button>.
  const exact = /^(in (de |mijn )?winkel(wagen|mand)( plaatsen| leggen)?|voeg toe aan winkelwagen|toevoegen( aan (winkel)?(wagen|mand))?|add to (cart|bag)|bestel( nu)?|koop( nu)?|kopen|reserveer)$/i;
  const loose = /in winkelwagen|winkelmand|toevoegen|add to cart|add to bag|bestel|koop|kopen|reserveer/i;
  const labelOf = el => (el.innerText || el.value || '').replace(/\s+/g, ' ').trim();
  const all = Array.from(document.querySelectorAll('button, a, input[type="submit"], div, span, p'));
  const pick = re => all.filter(el => { const t = labelOf(el); return t && t.length < 40 && re.test(t) && visible(el) && !el.closest('header, nav, footer'); });
  // Kleur op het element zelf, of op ::before / ::after (veel thema's tekenen de knop zo)
  const bgOf = el => {
    for (const ps of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, ps);
      if (ps && cs.content === 'none') continue;
      const c = opaque(cs.backgroundColor);
      if (brandish(c)) return { c, ps };
    }
    return null;
  };
  const buttonSized = el => { const r = el.getBoundingClientRect(); return r.width <= 700 && r.height <= 140; };

  let cta = null, ctaText = null;
  for (const el of [...pick(exact), ...pick(loose)]) {
    let holder = null, hit = null;
    if ((hit = bgOf(el))) holder = el;
    if (!holder) { // ouders op knopformaat
      for (let p = el.parentElement, i = 0; p && i < 4 && buttonSized(p); p = p.parentElement, i++) {
        if ((hit = bgOf(p))) { holder = p; break; }
      }
    }
    if (!holder) { // kinderen
      for (const d of el.querySelectorAll('*')) { if ((hit = bgOf(d))) { holder = d; break; } }
    }
    if (holder) { cta = { el: holder, color: hit.c, ps: hit.ps }; ctaText = el; break; }
  }

  // --- 2. Palet uit andere plekken (voor als er geen koopknopkleur is, en als keuzemenu in de UI)
  const palette = [];
  const addColor = (c, source) => {
    if (!c || !brandish(c)) return;
    if (palette.some(p => Math.abs(p.r - c.r) + Math.abs(p.g - c.g) + Math.abs(p.b - c.b) < 40)) return;
    palette.push({ r: c.r, g: c.g, b: c.b, source });
  };
  if (cta) addColor(cta.color, 'koopknop');
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) { const d = document.createElement('div'); d.style.color = theme.content; document.body.appendChild(d); addColor(opaque(getComputedStyle(d).color), 'theme-color'); d.remove(); }
  // Kleur van een brede balk: vaak staat de achtergrond op een wrapper binnen <footer>/<header>
  const wideBg = root => {
    for (const d of [root, ...Array.from(root.querySelectorAll('*')).slice(0, 80)]) {
      const r = d.getBoundingClientRect();
      if (r.width < innerWidth * 0.6 || r.height < 30) continue;
      const c = opaque(getComputedStyle(d).backgroundColor);
      if (c) return c;
    }
    return null;
  };
  for (const [sel, name] of [['footer', 'footer'], ['header', 'header'], ['nav', 'menu']]) {
    const el = document.querySelector(sel);
    if (el) addColor(opaque(getComputedStyle(el).backgroundColor) || wideBg(el), name);
  }
  for (const a of document.querySelectorAll('a[class*="btn"], a[class*="button"], button[class*="primary"], .btn-primary')) {
    if (visible(a)) addColor(opaque(getComputedStyle(a).backgroundColor), 'knop');
    if (palette.length >= 6) break;
  }

  // Accent: koopknop > theme-color > duidelijkst gekleurde uit het palet
  let accent = null;
  if (cta) accent = { c: cta.color, source: 'koopknop' };
  else {
    const t = palette.find(p => p.source === 'theme-color' && sat(p) > 0.2);
    const best = palette.slice().sort((a, b) => sat(b) - sat(a))[0];
    if (t) accent = { c: t, source: 'theme-color' };
    else if (best && sat(best) > 0.2) accent = { c: best, source: best.source };
  }

  // --- 3. Typografie en overige kleuren
  const h1 = document.querySelector('h1');
  const h1Cs = h1 ? getComputedStyle(h1) : null;
  const bodyCs = getComputedStyle(document.body);
  let ink = h1Cs && opaque(h1Cs.color);
  if (!ink || lum(ink) > 0.5) ink = opaque(bodyCs.color);
  if (!ink || lum(ink) > 0.5) ink = null;
  const pageBg = opaque(bodyCs.backgroundColor) || opaque(getComputedStyle(document.documentElement).backgroundColor);

  // Balkkleur: header-achtergrond als die donker is, anders de inktkleur
  let barBg = null;
  for (const sel of ['header', '[class*="header"]', 'nav', 'footer']) {
    const el = document.querySelector(sel);
    const c = el && (opaque(getComputedStyle(el).backgroundColor) || wideBg(el));
    if (c && lum(c) < 0.4) { barBg = c; break; }
  }
  if (!barBg && ink) barBg = ink;

  // Knopvorm van de échte koopknop (niet van een wrapper)
  const btnCs = cta ? getComputedStyle(cta.el, cta.ps) : null;
  const txtCs = ctaText ? getComputedStyle(ctaText) : null;
  let btnText = txtCs && opaque(txtCs.color);
  if (!accent || !cta || !btnText || contrast(btnText, accent.c) < 3) btnText = null; // overlay kiest dan zwart/wit
  const radius = btnCs ? btnCs.borderTopLeftRadius : null;

  return {
    accent: accent ? hex(accent.c) : null,
    accentSource: accent ? accent.source : null,
    palette: palette.map(p => ({ color: hex(p), source: p.source })),
    font: (bodyCs.fontFamily || '').trim() || null,
    headingFont: h1Cs ? (h1Cs.fontFamily || '').trim() || null : null,
    ink: rgb(ink),
    pageBg: pageBg && lum(pageBg) > 0.6 ? rgb(pageBg) : null,
    barBg: rgb(barBg),
    btnRadius: radius || null,
    btnText: rgb(btnText),
    btnTransform: (txtCs || btnCs) ? (txtCs || btnCs).textTransform : null,
    btnWeight: (txtCs || btnCs) ? (txtCs || btnCs).fontWeight : null,
    btnLetterSpacing: txtCs && txtCs.letterSpacing !== 'normal' ? txtCs.letterSpacing : null,
  };
}

module.exports = { extractBrandStyle };
