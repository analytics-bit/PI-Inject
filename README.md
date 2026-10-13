# PDP Demo Generator — PI Marketing

## ⭐ Mockup Studio (aanbevolen): `mockup-tool.html`

Visuele tool in één HTML-bestand — dubbelklik om te openen (internet nodig voor Tailwind/html2canvas CDN en het huisstijl-onderzoek). Workflow per prospect (±2 min):

1. **Upload** een (full-page) screenshot van hun PDP.
2. **Zoom & uitsnede**: zoom in, sleep de achtergrond naar het juiste deel, stel de hoogte van de uitsnede in.
3. **Huisstijl-onderzoek**: vul hun website in → merkkleuren worden automatisch opgehaald (theme-color, favicon, CSS) en toegepast op de componenten; klik een swatch om te wisselen.
4. **Sleep** de recommendation-carrousel en de pop-up op de juiste plek; pas teksten/breedtes aan; zet optioneel per component een 💡-infokader aan dat uitlegt wat er gebeurt.
5. **Presentatiemodus** (Esc = terug) voor live demo's, of **Download als PNG** voor in een mail/deck.

Alles met een gestippelde rand + badge is duidelijk gemarkeerd als "Geïnjecteerd door PI Marketing".

---

## Automatische generator (Playwright)

Genereert sales-demo's voor prospects: een screenshot van hun échte productpagina (PDP)
met daaroverheen onze dienstverlening geïnjecteerd — popup, product-recommendations-carrousel
(met echte producten van hun eigen site), social proof en sticky bar. Elk element krijgt een
gestippelde rand + badge "Geïnjecteerd door PI Marketing".

## Nieuwe prospect (2 minuten)

1. Kopieer `configs/_template.json` naar `configs/<prospect>.json`
2. Vul in: `name`, `url` (een PDP) en `catalogUrl` (een categoriepagina, als fallback voor de carrousel)
3. Draai:

```bash
node generate.js configs/<prospect>.json
```

Output in `output/<prospect>/`:

| Bestand | Wat |
|---|---|
| `01-popup.png` | Hero-shot: PDP met welkomstpopup |
| `02-fullpage.png` | Volledige PDP met carrousel, social proof en sticky bar |
| `03-detail-*.png` | Losse crops per element |
| `onepager.pdf` / `.png` | Opgemaakte 2-pagina one-pager voor in de mail |
| `onepager.html` | Bron van de one-pager (tekst aanpasbaar, daarna opnieuw draaien) |

## Hoe het werkt

- Headless Chrome (Playwright, gebruikt de systeem-Chrome) opent de PDP, klikt de cookiebanner weg
  en scrollt de pagina door voor lazy-loaded content.
- De accentkleur wordt automatisch van de koopknop gepakt (`accentColor` in config overschrijft dit).
- De carrousel wordt gevuld met producten die van de PDP zelf worden gescraped; bij minder dan
  4 resultaten wordt `catalogUrl` gescraped. Handmatig aanvullen kan via `recommendations` in de config.
- Alle teksten (popup, sticky bar, social proof, carrouseltitel) zijn per prospect aan te passen in de config;
  laat je ze weg, dan gelden de standaardteksten. Een blok uitzetten: `"stickyBar": false`.

## Troubleshooting

- **Cookiebanner nog zichtbaar** → knoptekst ontbreekt in het patroon in `generate.js` (`dismissCookieBanners`).
- **Carrousel leeg/raar** → geef een betere `catalogUrl` of vul `recommendations` handmatig.
- **Bot-detectie (Cloudflare e.d.)** → probeer een andere pagina van de site; werkt het niet, dan is dit
  de zeldzame site waar handmatig een screenshot nodig is.
