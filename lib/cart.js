// Legt het product van de PDP in de winkelwagen, zodat de checkout-/winkelwagenpagina daarna niet leeg is.
// Draait met de site-JS AAN (de knop moet echt iets doen). Best effort: lukt het niet, dan gaat de demo
// gewoon verder met wat de winkelwagenpagina laat zien.

// Draait in de browser-context: kies een maat/variant als dat moet en klik op de koopknop.
function clickAddToCart() {
  const visible = e => e && e.offsetParent !== null && e.getBoundingClientRect().height > 0;
  const h1 = document.querySelector('h1');
  const after = e => !h1 || (h1.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING);
  const picked = [];

  // 1. Keuzelijsten (maat, kleur, variant): eerste beschikbare echte optie
  for (const sel of document.querySelectorAll('select')) {
    if (!visible(sel) || !after(sel)) continue;
    if (sel.closest('header, footer, nav')) continue;
    const label = `${sel.name} ${sel.id} ${sel.className} ${(sel.labels && sel.labels[0] && sel.labels[0].innerText) || ''}`;
    if (/aantal|qty|quantity|sort|taal|lang|land|country|currency/i.test(label)) continue;
    const cur = sel.options[sel.selectedIndex];
    const isPlaceholder = !cur || !cur.value || /kies|selecteer|choose|select/i.test(cur.text);
    if (!isPlaceholder) continue;
    const opt = Array.from(sel.options).find(o => o.value && !o.disabled && !/kies|selecteer|choose|select|uitverkocht|sold out|niet leverbaar/i.test(o.text));
    if (opt) {
      sel.value = opt.value;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      picked.push(opt.text.trim().slice(0, 20));
    }
  }
  // 2. Maatknoppen / radio's in een blok dat over maat of variant gaat
  const groups = Array.from(document.querySelectorAll('[class*="size" i], [class*="maat" i], [class*="variant" i], [class*="swatch" i], [class*="option" i], fieldset'))
    .filter(g => visible(g) && after(g) && !g.closest('header, footer, nav') && g.getBoundingClientRect().height < 400);
  for (const g of groups) {
    if (g.querySelector('input[type="radio"]:checked, [aria-checked="true"], [aria-pressed="true"], .active, .selected')) continue;
    const opts = Array.from(g.querySelectorAll('input[type="radio"], button, [role="radio"], li > a, label'))
      .filter(o => !o.disabled && o.getAttribute('aria-disabled') !== 'true' && !/disabled|unavailable|soldout|sold-out|uitverkocht/i.test(o.className))
      .filter(o => { const t = (o.innerText || o.value || '').trim(); return t.length <= 8 || o.type === 'radio'; });
    if (opts.length >= 2) {
      const o = opts[0];
      const target = o.type === 'radio' && o.labels && o.labels[0] ? o.labels[0] : o;
      target.click();
      picked.push(((target.innerText || o.value || '').trim()).slice(0, 20));
      break;
    }
  }
  // 3. De koopknop (dezelfde herkenning als in de overlay, zonder uitverkocht-knoppen)
  const buyRe = /in winkelwagen|winkelmand|toevoegen|add to cart|add to bag|bestel|koop|kopen|in mijn/i;
  const btn = Array.from(document.querySelectorAll('button, a[role="button"], input[type="submit"], a.button, a.btn'))
    .filter(b => { const t = (b.innerText || b.value || '').trim(); return t && t.length < 60 && buyRe.test(t) && visible(b) && !b.disabled; })
    .find(after);
  if (!btn) return { clicked: null, picked };
  btn.click();
  return { clicked: (btn.innerText || btn.value || '').trim().slice(0, 40), picked };
}

// Opent de PDP op een nieuwe pagina in dezelfde browsercontext (cookies = winkelwagen) en klikt op de koopknop.
// prepare(page, url) laadt de pagina en klikt de cookiebanner weg (preparePage uit run.js).
async function addProductToCart(context, url, prepare, log = console.log) {
  const page = await context.newPage();
  try {
    const { blocked } = await prepare(page, url);
    if (blocked) { log(`  ⚠ winkelwagen vullen overgeslagen: ${blocked}-controle op de PDP`); return false; }
    await page.evaluate(() => window.scrollTo(0, 0));
    let res = await page.evaluate(clickAddToCart);
    // sommige shops tonen pas na het kiezen van een maat een actieve knop: één keer opnieuw proberen
    if (res.clicked) await page.waitForTimeout(2500);
    else { await page.waitForTimeout(1200); res = await page.evaluate(clickAddToCart); if (res.clicked) await page.waitForTimeout(2500); }
    if (!res.clicked) { log('  ⚠ geen koopknop gevonden om het product in de winkelwagen te leggen'); return false; }
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    log(`  ↳ product in de winkelwagen gelegd via "${res.clicked}"${res.picked.length ? ` (gekozen: ${res.picked.join(', ')})` : ''}`);
    return true;
  } catch (err) {
    log(`  ⚠ winkelwagen vullen mislukt (${String(err.message).split('\n')[0].slice(0, 120)})`);
    return false;
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { addProductToCart, clickAddToCart };
