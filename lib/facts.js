// Draait in de browser-context: verzamelt feiten over de productpagina
// (titel, categorie, prijs, beschrijving, echte verzend-/retourvoorwaarden)
// als input voor de persona- en copy-stap.
function extractPageFacts() {
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const facts = { url: location.href, title: null, brand: null, price: null, description: null, breadcrumbs: [], shipping: [], excerpt: '' };

  // JSON-LD (Product / BreadcrumbList)
  const walk = n => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== 'object') return;
    const type = [].concat(n['@type'] || []);
    if (type.includes('Product')) {
      facts.title = facts.title || clean(n.name);
      facts.description = facts.description || clean(n.description);
      facts.brand = facts.brand || clean(typeof n.brand === 'object' ? n.brand.name : n.brand);
      const offer = [].concat(n.offers || [])[0];
      if (offer) facts.price = facts.price || (offer.price || (offer.lowPrice)) && `${offer.priceCurrency === 'EUR' || !offer.priceCurrency ? '€' : offer.priceCurrency} ${offer.price || offer.lowPrice}`;
    }
    if (type.includes('BreadcrumbList')) {
      facts.breadcrumbs = (n.itemListElement || []).map(i => clean(i.name || (i.item && i.item.name))).filter(Boolean);
    }
    if (n['@graph']) walk(n['@graph']);
  };
  document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    try { walk(JSON.parse(s.textContent)); } catch {}
  });

  const meta = n => { const el = document.querySelector(`meta[property="${n}"], meta[name="${n}"]`); return el ? clean(el.content) : null; };
  const h1 = document.querySelector('h1');
  facts.title = facts.title || (h1 && clean(h1.innerText)) || meta('og:title') || clean(document.title);
  facts.description = facts.description || meta('og:description') || meta('description');

  if (!facts.breadcrumbs.length) {
    const bc = document.querySelector('nav[aria-label*="rood" i], nav[aria-label*="bread" i], [class*="breadcrumb"]');
    if (bc) facts.breadcrumbs = Array.from(bc.querySelectorAll('a, li, span')).map(e => clean(e.innerText)).filter(t => t && t.length < 40);
    facts.breadcrumbs = Array.from(new Set(facts.breadcrumbs));
  }
  if (!facts.price) {
    const m = (document.querySelector('main') || document.body).innerText.match(/€\s?\d{1,4}(?:[.,]\d{2})?/);
    if (m) facts.price = m[0];
  }

  // Echte voorwaarden: korte regels over verzending, retour, levertijd
  const re = /gratis verzend|verzendkosten|retour|bezorg|levertijd|voor \d{1,2}[:.]\d{2}|morgen in huis|vandaag besteld|30 dagen|14 dagen|achteraf betal|klantenservice|garantie/i;
  const seen = new Set();
  for (const el of document.querySelectorAll('li, p, span, div, a')) {
    if (el.children.length > 2) continue;
    const t = clean(el.innerText);
    if (t.length > 8 && t.length < 110 && re.test(t) && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      facts.shipping.push(t);
      if (facts.shipping.length >= 8) break;
    }
  }

  const main = document.querySelector('main') || document.body;
  facts.excerpt = clean(main.innerText).slice(0, 1500);
  return facts;
}

module.exports = { extractPageFacts };
