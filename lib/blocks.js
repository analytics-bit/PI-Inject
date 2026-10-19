// Draait in de browser-context (page.evaluate): zet window.__pimBlocks(ns) neer, dé plek waar
// bepaald wordt uit welke "secties" een pagina bestaat. Zowel de outline (voor de AI) als de
// carrousel-plaatsing gebruiken dit, zodat sectie-nummers altijd overeenkomen.
function installBlocks() {
  window.__pimBlocks = function (ns) {
    const SKIP = ['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT'];
    const footerEl = document.querySelector('footer');
    const kidsOf = el => Array.from(el.children).filter(c => !SKIP.includes(c.tagName) && !String(c.className).includes(ns) && c.getBoundingClientRect().height > 40);
    const descend = el => { let cur = el; for (let i = 0; i < 4; i++) { const k = kidsOf(cur); if (k.length === 1) cur = k[0]; else break; } return cur; };
    let container = descend(document.querySelector('main') || document.body);
    if (kidsOf(container).length < 3) container = descend(document.body);
    // alles vanaf de footer (of het blok dat de footer bevat) valt af
    const blocksOf = c => {
      const blocks = kidsOf(c);
      const footIdx = footerEl ? blocks.findIndex(b => b === footerEl || b.contains(footerEl)) : -1;
      return footIdx >= 0 ? blocks.slice(0, footIdx) : blocks;
    };
    let usable = blocksOf(container);
    // Weinig blokken = alles zit in één grote wrapper: daar een niveau dieper in kijken
    for (let n = 0; n < 3 && usable.length < 5; n++) {
      const big = usable.slice().sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
      if (!big || kidsOf(big).length < 3 || (footerEl && big.contains(footerEl))) break;
      container = big;
      usable = blocksOf(container);
    }
    return { usable, footerEl, container };
  };
  return true;
}

module.exports = { installBlocks };
