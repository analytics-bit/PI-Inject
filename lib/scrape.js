// Draait in de browser-context: zoekt productkaarten op de pagina zelf
// (gerelateerde producten, "anderen bekeken", categorie-verwijzingen)
// zodat de carrousel echte producten van de prospect toont.
function scrapeProducts() {
  const seen = new Set();
  const products = [];
  const priceRe = /€\s?\d{1,4}(?:[.,]\d{2})?(?:\s?[-–]\s?)?|\b\d{1,4},\d{2}\b|\b\d{1,4},-/;

  const anchors = Array.from(document.querySelectorAll('a[href]'));
  for (const a of anchors) {
    // geen navigatie-, logo- of footerlinks
    if (a.closest('header, footer, nav, [class*="breadcrumb"], [class*="menu"], [id*="menu"]')) continue;
    const img = a.querySelector('img');
    if (!img) continue;
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith('data:')) continue;
    if (/logo|icon|sprite|payment|flag/i.test(src)) continue;
    const rect = img.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) continue;

    const href = a.href;
    if (seen.has(href) || href === location.href) continue;

    // titel: alt-tekst of tekst in de kaart
    let title = (img.alt || '').trim();
    if (!title || title.length < 3) {
      const txt = (a.innerText || '').trim().split('\n').map(s => s.trim()).filter(s => s.length > 3 && !priceRe.test(s));
      title = txt[0] || '';
    }
    if (!title || title.length < 3) continue;

    // prijs: zoek in de kaart (anchor of directe parent)
    let price = null;
    const scope = a.closest('li, article, div') || a;
    const m = (scope.innerText || '').match(priceRe);
    if (m) {
      price = m[0].replace(/\s?[-–]\s?$/, '').trim();
      if (!price.includes('€')) price = `€ ${price}`;
    }

    seen.add(href);
    products.push({ title: title.slice(0, 80), img: src, price, url: href });
    if (products.length >= 12) break;
  }
  return products;
}

module.exports = { scrapeProducts };
