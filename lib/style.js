// Draait in de browser-context: leest de huisstijl van de pagina uit (lettertype,
// kleuren, knopvorm) zodat de geïnjecteerde elementen er native uitzien.
// Moet volledig self-contained zijn. Geeft null-waardes terug als iets niet te vinden is.
function extractBrandStyle() {
  const parse = c => {
    const m = (c || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(',').map(s => parseFloat(s));
    return { r, g, b, a };
  };
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const opaque = c => { const p = parse(c); return p && p.a > 0.9 ? p : null; };

  const btnTexts = /in winkelwagen|winkelmand|toevoegen|add to cart|add to bag|bestel|koop|kopen|reserveer/i;
  let btn = null;
  for (const b of document.querySelectorAll('button, a[role="button"], input[type="submit"], a.button, a.btn')) {
    const t = (b.innerText || b.value || '').trim();
    if (t && t.length < 60 && btnTexts.test(t) && b.offsetParent !== null) { btn = b; break; }
  }
  const btnCs = btn ? getComputedStyle(btn) : null;

  const h1 = document.querySelector('h1');
  const h1Cs = h1 ? getComputedStyle(h1) : null;
  const bodyCs = getComputedStyle(document.body);

  // Paginatekst/koppen moeten donker genoeg zijn om leesbaar op wit te blijven
  let ink = h1Cs && opaque(h1Cs.color);
  if (!ink || lum(ink) > 0.5) ink = opaque(bodyCs.color);
  if (!ink || lum(ink) > 0.5) ink = null;

  const pageBg = opaque(bodyCs.backgroundColor) || opaque(getComputedStyle(document.documentElement).backgroundColor);

  // Balkkleur: header-achtergrond als die donker is, anders de inktkleur
  let barBg = null;
  for (const sel of ['header', '[class*="header"]', 'nav']) {
    const el = document.querySelector(sel);
    const c = el && opaque(getComputedStyle(el).backgroundColor);
    if (c && lum(c) < 0.4) { barBg = c; break; }
  }
  if (!barBg && ink) barBg = ink;

  const rgb = c => c ? `rgb(${c.r}, ${c.g}, ${c.b})` : null;
  const firstFont = f => (f || '').trim() || null;
  const radius = btnCs ? btnCs.borderTopLeftRadius : null;
  const btnText = btnCs && opaque(btnCs.color);

  return {
    font: firstFont(bodyCs.fontFamily),
    headingFont: h1Cs ? firstFont(h1Cs.fontFamily) : null,
    ink: rgb(ink),
    pageBg: pageBg && lum(pageBg) > 0.6 ? rgb(pageBg) : null,
    barBg: rgb(barBg),
    btnRadius: radius && radius !== '0px' ? radius : (radius === '0px' ? '0px' : null),
    btnText: rgb(btnText),
    btnTransform: btnCs ? btnCs.textTransform : null,
    btnWeight: btnCs ? btnCs.fontWeight : null,
    btnLetterSpacing: btnCs && btnCs.letterSpacing !== 'normal' ? btnCs.letterSpacing : null,
  };
}

module.exports = { extractBrandStyle };
