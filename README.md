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
- **Bot-detectie (Cloudflare e.d.)** → lokaal (`node app.js` of `node generate.js`) opent er automatisch een
  Chrome-venster met de site: los de controle daar zelf op, daarna gaat de demo in dat venster verder (max. 5 minuten
  wachten; de webapp toont "Wacht op jou"). Op Netlify kan dat niet: draai de demo dan lokaal, probeer een andere pagina
  van de site of upload een handmatige screenshot (zie "Handmatige screenshots" hieronder). Uitzetten: `INTERACTIVE_BROWSER=0`.

## Huisstijl en persona-copy (automatisch)

- **Huisstijl:** `generate.js` leest lettertype, koppen-font, inktkleur, knopvorm (radius, hoofdletters, gewicht) en headerkleur van de PDP uit en past die toe op de geïnjecteerde elementen.
- **Persona-copy:** de PDP-feiten (titel, categorie, prijs, echte verzend-/retourtekst) gaan naar een goedkoop model via OpenRouter, dat het producttype bepaalt, een doelpersona kiest en de popup-, sticky bar-, social proof- en carrouseltekst op die persona schrijft. Resultaat staat in `output/<prospect>/persona.json`.
- Volgorde per tekstblok: waarde in config > gegenereerd > standaardtekst. Zet `"autoCopy": false` in de config om de generator uit te zetten.
- **Instellen:** zet `OPENROUTER_API_KEY` als omgevingsvariabele of in een lokale `.env` (staat in `.gitignore`; nooit committen). Model wisselen kan met `OPENROUTER_MODEL` (standaard `google/gemini-2.5-flash-lite`). Zonder sleutel worden de standaardteksten gebruikt.

---

## Webversie (voor collega's, zonder terminal)

`public/index.html` + `netlify/functions/*` vormen een webapp: formulier → live voortgang → screenshots, one-pager en persona → teksten aanpassen en opnieuw genereren. Wachtwoordbeveiligd; eerdere demo's staan in de lijst links.

### Deployen op Netlify

1. Koppel de GitHub-repo aan Netlify (New site → Import from Git). De instellingen staan in `netlify.toml`; er is geen build-command nodig. Publish directory = `public`.
2. Zet onder *Site configuration → Environment variables* (scope **Functions** aanvinken):
   - `OPENROUTER_API_KEY` — de OpenRouter-sleutel
   - `APP_PASSWORD` — het gedeelde wachtwoord voor collega's
   - optioneel `SESSION_SECRET` (willekeurige lange tekst), `OPENROUTER_MODEL`
3. Deploy en open de site-URL.

Hoe het werkt: de pagina start een **background function** (max. 15 min) die in een Chromium (`@sparticuz/chromium-min`, wordt bij een koude start gedownload) de generator draait. Voortgang en bestanden komen in **Netlify Blobs**; de pagina pollt elke 2 seconden.

Goed om te weten:
- Eerste run na een tijd stilte is trager (koude start + Chromium downloaden, enkele seconden extra).
- Netlify draait vanaf datacenter-IP's. Sites achter Cloudflare/bot-detectie kunnen de generator blokkeren; die werken lokaal soms wél. Probeer dan een andere pagina van de site of gebruik `mockup-tool.html`.
- Op Netlify wordt op schaal 1,5 gerenderd (lokaal 2) om binnen het geheugen te blijven.
- Voorbeeldwaarden (korting, code, aantal bezoekers) zijn demo-waarden; de AI mag alleen verzend-/retourclaims gebruiken die op de pagina staan.
- URL's naar interne adressen (localhost, 10.x, 192.168.x) worden geweigerd.

### Lokaal draaien (of op Render/Railway/Docker)

```bash
npm install
cp .env.example .env   # vul OPENROUTER_API_KEY in (APP_PASSWORD leeg laten = geen login, alleen bereikbaar op deze computer)
npm start              # http://localhost:8462
```

`app.js` is dezelfde API als de Netlify-functions, maar als gewone Node-server met opslag in `.data/` — handig om te testen of als terugvaloptie als Netlify sites blokkeert (er is dan een container met Chrome nodig; op Render kan dat met Docker).

De command-line werkt nog steeds: `node generate.js configs/<prospect>.json`.

### Onderdelen (personalisaties)

Popup, sticky bar, social proof, carrousel en **spaarpunten** (voortgangsbalk voor leden: "X sparen N punten met dit artikel"). Elk onderdeel kan in de webapp uit/aan; in een config zet je `"loyalty": false` enz. Spaarpunten: `loyalty: { programName, pointsPerEuro, currentPoints, milestones }` — het aantal te verdienen punten volgt uit de productprijs; punten van de klant en stappen zijn demo-waarden. Social proof en spaarpunten staan standaard onder de koopknop (`socialProof.position`: `below-cta` | `above-cta` | `below-title`).

**Story-rij** (ronde productplaatjes met ring, boven de vouw, onder header/breadcrumbs) en **weergave mobiel**: kies in de webapp "Mobiel (390 px)" (of `"device": "mobile"` in een config) om de pagina in iPhone-formaat te renderen. Naast het hero-beeld met popup komt dan ook `01b-above-the-fold.png` (zonder popup).

**Voorraadmelding** (`stockAlert`): een knop direct onder de koopknop ("Mail mij als dit product weer op voorraad is") die een popup opent waarin de bezoeker zijn e-mailadres achterlaat. Staat het onderdeel aan, dan komt hij er altijd in, bij elk bezoekersprofiel: de AI past alleen de teksten aan en kan hem niet per profiel uitzetten (dat kan alleen met het vinkje, of `"stockAlert": false` in een config). Plek, in volgorde: onder de koopknop, onder de prijs, onder de titel, vóór het eerste blok van de pagina, en als laatste vangnet zwevend rechtsonder; de log en `persona.json` (`meta.stockAlertPlacement`) zeggen welke. Teksten: `stockAlert: { button, headline, sub, cta }`. Extra bestanden: `04-stockalert.png` (PDP met geopende popup), `03-detail-stockalert-knop.png` en `03-detail-stockalert.png`.

**Checkoutpagina en kassakoopjes** (`checkoutUrl`, `checkoutDeals`): vul optioneel de URL van de winkelwagen- of checkoutpagina in. De generator legt dan eerst het product van de PDP in de winkelwagen (kiest zo nodig de eerste beschikbare maat) en maakt daarna een demo van die pagina met onderaan de **kassakoopjes**: een raster met de goedkoopste producten die op de site gevonden zijn (standaard 6, 3 per rij; op mobiel 2 per rij). Het onderdeel "Kassakoopjes" is in de webapp pas aan te vinken als de checkout-URL is ingevuld; zonder checkoutUrl staat het altijd uit. Lukt het vullen van de winkelwagen niet, dan komen de kassakoopjes op de (lege) winkelwagenpagina. Titel en aantal: `checkoutDeals: { title, count }`. De checkoutpagina wordt per bezoekersprofiel gemaakt: de AI schrijft per profiel een eigen kassakoopjes-titel en eigen teksten voor "mail mijn winkelwagen" (aan te passen in de editor). Bestanden: `checkout-01-kassakoopjes.png`, `checkout-02-fullpage.png` en `checkout-03-detail-kassakoopjes.png`, bij meerdere profielen met voorvoegsel `v1-`, `v2-`, ...; de one-pager van elk profiel krijgt een blok Kassakoopjes.

**Mail mijn winkelwagen** (`mailCart`): op dezelfde checkoutpagina een knop onder de afrekenknop ("Mail mijn winkelwagen naar mezelf") die een popup opent waarin de bezoeker zijn e-mailadres invult om de producten in zijn winkelwagen naar zichzelf te mailen. Zelfde stijl als de voorraadmelding. Net als de kassakoopjes alleen aan te vinken met een checkout-URL; de twee staan los van elkaar aan of uit. Plek, in volgorde: onder de afrekenknop, boven de kassakoopjes, onder de titel, en als vangnet zwevend rechtsonder (`meta.mailCartPlacement`). Teksten: `mailCart: { button, headline, sub, cta }`. Bestanden: `checkout-04-mailcart.png` (met geopende popup), `checkout-03-detail-mailcart-knop.png` en `checkout-03-detail-mailcart.png`.

### Bezoekersprofielen (persoonlijke versies)

De AI bepaalt het type shop/product en bedenkt 2–3 bezoekersprofielen (bijv. "Nieuwe anonieme bezoeker", "Bekende koopjesjager", "Vaste loyale klant die minder ontvankelijk is voor korting"). Per profiel krijg je een eigen versie van popup (met een incentive die past bij de sector en het profiel, niet standaard "10% korting"), sticky bar, social proof, carrouseltitel en spaarpunten, plus een uitleg **wat er verandert en waarom**. Bestanden hebben het voorvoegsel `v1-`, `v2-`, ... In de webapp: tabs per profiel; kies het aantal profielen of vul eigen profielen in (één per regel). Bewerk je een profiel en klik "Opnieuw genereren", dan blijven de andere profielen ongewijzigd (geen nieuwe AI-tekst). In een config: `profileCount` (1–3) en `profileHints` (lijst met namen); zonder AI-sleutel krijg je één standaardversie.

AI-aanroepen proberen het opnieuw bij een rate limit (429) en vallen daarna terug op een tweede goedkoop model (`OPENROUTER_FALLBACK_MODEL`, standaard `openai/gpt-4o-mini`).

### Handmatige screenshots (als de site het ophalen blokkeert)

Sommige sites blokkeren de generator (Cloudflare, bot-detectie, vooral vanaf Netlify). Upload dan zelf een screenshot van de **volledige pagina** in het formulier onder "Handmatige screenshots":

- **PDP**: vervangt het ophalen van de PDP-URL (die mag dan leeg blijven). Alle blokken (popup, sticky bar, carrousel, social proof, spaarpunten, story-rij) komen over de screenshot heen.
- **Categoriepagina**: levert een eigen demo met popup, sticky bar, story-rij en een carrousel "Aanbevolen voor jou" boven het productoverzicht (bestanden `cat-*.png`). Social proof en spaarpunten horen bij één product en vallen hier af. Werkt ook naast een live opgehaalde PDP.

Screenshot maken: Chrome → DevTools → ⋮ → *Run command* → "Capture full size screenshot", of een extensie als GoFullPage. Klik eerst de cookiebanner weg. Een screenshot van een telefoon wordt automatisch mobiel weergegeven.

Hoe het werkt (`lib/screenshot.js`): een AI met beeldherkenning (`OPENROUTER_VISION_MODEL`, standaard `google/gemini-2.5-flash`) leest titel, prijs, verzendteksten, kleuren, secties, producttegels en de plek van titel en koopknop uit het beeld; een tweede, scherpere blik op het stuk rond de titel maakt die posities nauwkeuriger. Daarna wordt de screenshot in stroken omgezet naar een nagebootste pagina met een echte (onzichtbare) titel, koopknop en secties, zodat de gewone injectie werkt: blokken onder de koopknop duwen de rest van de infokolom omlaag. Producttegels worden uit de screenshot geknipt voor carrousel en story-rij. Plaatsing is een benadering; zonder AI-sleutel komen social proof en spaarpunten niet op de pagina.

De browser zet de screenshot vóór het uploaden om naar JPEG (max. 2880 px breed en ±16 megapixel) en uploadt in delen van 1,5 MB (`/api/upload`). Opnieuw genereren en doorprompten gebruiken dezelfde upload. In een config (CLI): `"screenshots": { "pdp": "pad.png", "category": "pad.png" }`, relatief aan het configbestand.

### Eigen instructies en doorprompten

- **Bij de eerste generatie:** het veld "Extra instructies voor de AI" (in een config: `instructions`) gaat mee in de opdracht, bijvoorbeeld "mik op studenten, informele toon, noem geen verzending".
- **Daarna doorprompten:** onder het resultaat staat "Doorprompten". Typ wat er anders moet (bijv. "maak de popup van het tweede profiel korter", "voeg een profiel toe voor cadeau-kopers", "laat social proof weg bij profiel 1"). De AI past alleen aan wat je vraagt, laat de rest ongewijzigd, legt uit wat er is veranderd, en de pagina wordt opnieuw gegenereerd (± 1 minuut). Herhaal tot het naar wens is. Het gesprek en de beginopdracht blijven bewaard bij elk resultaat en komen terug als je een eerdere demo opent. Eigen bewerkingen in de velden worden meegenomen.
- In een config: `refine` (de aanpas-prompt), `chat` (eerdere stappen) en `profiles` (de huidige profielen).

**Het gekozen aantal profielen klopt altijd.** Eigen profielen (`profileHints`) tellen mee voor het aantal en worden niet opgevat als "alleen deze"; de AI vult aan tot het gekozen aantal. Geeft de AI er te weinig terug, dan worden de ontbrekende apart aangevraagd (max. twee keer). Lukt dat niet (rate limit, geen sleutel), dan worden ze aangevuld met standaardprofielen ("Nieuwe anonieme bezoeker", "Bekende koopjesjager", "Vaste loyale klant") met neutrale teksten, en de uitleg zegt dat het standaardversies zijn. Alleen bij "1" valt een mislukte AI-aanroep terug op één standaardversie.
