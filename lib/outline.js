// Draait in de browser-context (na installBlocks): een compacte beschrijving van de secties van
// de pagina, als input voor de AI die kiest waar de carrousel hoort, en voor het keuzemenu.
function extractOutline() {
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const abs = el => Math.round(el.getBoundingClientRect().top + window.scrollY);
  const { usable, footerEl } = window.__pimBlocks('pim-demo');
  const sections = usable.map((b, i) => {
    const h = b.querySelector('h1, h2, h3, h4');
    const productLinks = Array.from(b.querySelectorAll('a[href]')).filter(a => a.querySelector('img')).length;
    return {
      i,
      heading: clean(h ? h.innerText : '').slice(0, 70),
      hint: `${clean(b.id)} ${clean(String(b.className))}`.trim().slice(0, 60),
      top: abs(b),
      height: Math.round(b.getBoundingClientRect().height),
      hasH1: !!b.querySelector('h1'),
      hasBuyButton: /in winkelwagen|add to cart|toevoegen aan/i.test(b.innerText || ''),
      productLinks: Math.min(productLinks, 30),
      text: clean(b.innerText).slice(0, 90),
    };
  });
  return { sections, pageHeight: document.documentElement.scrollHeight, footerTop: footerEl ? abs(footerEl) : null };
}

module.exports = { extractOutline };
