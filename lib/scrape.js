// Draait in de browser-context: zoekt productkaarten op de pagina zelf
// (gerelateerde producten, "anderen bekeken", categorie-verwijzingen)
// zodat de carrousel echte producten van de prospect toont.
function scrapeProducts() {
  const seen = new Set();
  const products = [];
  const priceRe = /€\s?\d{1,4}(?:[.,]\d{2})?(?:\s?[-–]\s?)?|\b\d{1,4},\d{2}\b|\b\d{1,4},-/;
  // Voorraad-, levering- en badgetekst hoort niet in een titel ("Op voorraad", "Morgen in huis", "Nieuw", "-20%")
  const stockRe = /voorraad|uitverkocht|leverbaar|beschikbaar|in stock|out of stock|bezorg|levertijd|verzend|morgen in huis|vandaag besteld|laatste stuks|nog \d+ (stuks|op)|wachtlijst|op=op/i;
  const badgeRe = /^(nieuw|new|sale|actie|bestseller|populair|top ?deal|-?\s?\d+\s?%)$/i;
  const goodLine = s => s.length > 3 && !priceRe.test(s) && !stockRe.test(s) && !badgeRe.test(s);
  const textLines = el => {
    const out = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const t = w.currentNode.nodeValue.replace(/\s+/g, ' ').trim(); if (t) out.push(t); }
    return out;
  };
  // alt-teksten bestaan soms uit "Titel - Op voorraad": alleen de goede delen houden
  const cleanTitle = t => t.split(/\s[-–—|·]\s|\n/).map(s => s.trim()).filter(s => s && !stockRe.test(s) && !badgeRe.test(s)).join(' - ');

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
    let title = cleanTitle((img.alt || '').trim());
    if (!title || title.length < 3) {
      // tekst per tekstknoop (innerText plakt inline-elementen aan elkaar), zonder voorraad/prijs/badges
      const txt = textLines(a).filter(goodLine);
      // korte eerste regel = vaak het merk: dan merk + productnaam samen
      title = txt[0] && txt[0].length < 25 && txt[1] ? `${txt[0]} ${txt[1]}` : (txt[0] || '');
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
