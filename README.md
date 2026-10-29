# De Lijn bus HMI

Prototype van een infotainmentsysteem voor een elektrische bus. De chauffeur ziet de route, het bereik, de batterij en het klimaat. Het prototype is een oefening op de **View Transition API** en is gebouwd met gewone HTML, CSS en JavaScript, zonder build stap.

## Starten

Open `index.html` in een browser, of start een lokale server:

```bash
python3 -m http.server 5188
```

Ga daarna naar `http://localhost:5188`. De lettertypes en iconen komen van een CDN, dus je hebt internet nodig.

Gebruik een browser die view transitions ondersteunt (Chrome, Edge of Safari). In andere browsers werkt alles zonder animatie.

## Wat je kan proberen

- Klik op de kaart, een tegel of het klimaatblok op het **Overzicht**. Het aangeklikte blok groeit door naar zijn detailscherm.
- Gebruik de **navigatiebalk** onderaan. De gele pil schuift mee naar het actieve item.
- Klik op de **maan** rechtsboven. Nacht en dag wisselen met een cirkel die uitdijt vanaf de knop.
- Pas de temperatuur aan met min en plus. De waarde verandert op alle schermen.
- De terugknop van je browser werkt, want elke weergave heeft een eigen `#`-link.

## Hoe de overgangen werken

| Onderdeel | Waar | Uitleg |
|---|---|---|
| `view-transition-name` | `css/styles.css`, onderaan | `map`, `range`, `battery` en `climate` bestaan in meerdere weergaven. De browser morpht ze naar elkaar. |
| `document.startViewTransition()` | `js/app.js`, functie `show()` | De DOM wordt gewisseld in de callback. De browser maakt een foto van voor en na. |
| Pil in de navigatie | `.nav__pill` | Eén pil met `view-transition-name: nav-pill`, altijd het eerste kind van de balk en in de kolom van het actieve item (grid). Icoon en label hebben eigen lagen (`nav-content-1` tot `-4`) erboven. Zo ligt de pil in beide richtingen onder de tekst. |
| Dag en nacht | `js/app.js`, `themeButton` | Een animatie op `::view-transition-new(root)` met `clip-path: circle()`. De namen gaan tijdens de wissel even uit via `.theme-switching`. |
| Erbij en weg | `::view-transition-new(*):only-child` | Elementen die maar in één van de twee staten bestaan (bijvoorbeeld de route-kaart) schuiven omhoog binnen of zakken weg, met een korte vertraging per element. |
| Header | `::view-transition-old(header)` | De header gaat omhoog weg en komt van boven terug met de nieuwe titel. |
| Kaart die lager wordt | `::view-transition-old(map)` | `object-fit: none` laat de tekst niet uitrekken terwijl de kaart krimpt. |
| Minder beweging | `prefers-reduced-motion` | De animaties duren dan bijna 0 ms. |

Een `view-transition-name` moet uniek zijn op het moment van de overgang. Daarom is er telkens maar één weergave zichtbaar (`hidden`).

## Bestanden

```
index.html        alle vier de weergaven en de vaste header en navigatie
css/tokens.css    kleur, spacing, radius en motion uit Figma, met Day en Night
css/styles.css    componenten, layout en de view transitions
js/app.js         navigatie, thema en klimaatbediening
```

## Van Figma naar code

De CSS-variabelen hebben de namen van de Figma-variabelen. `color/bg/surface` is `--color-bg-surface` en `spacing/lg` is `--spacing-lg`. De lagen in Figma heten hetzelfde als de `view-transition-name` waarden (`Kaart`, `Tegel / Bereik`, `Klimaat`).

Het ontwerp in Figma is 1024 x 1366 px (iPad Pro 12.9 staand). In code is `.screen` geen mockup: het vult het hele venster en alle maten schalen mee.

- **Eenheid `--u`** (in `css/tokens.css`): alle maten zijn `calc(N * var(--u))`. Staand is `--u` het venster gedeeld door 1024 x 1366, liggend gedeeld door 1920 x 1080. Zo blijft de verhouding van tekst en blokken gelijk op elk scherm.
- **Alles groter of kleiner?** Zet `--ui-scale` in `css/tokens.css` hoger of lager (standaard 1).
- **Staand** (tablet): alles onder elkaar, zoals in Figma.
- **Liggend** (auto-display, monitor): twee kolommen per weergave. Dat geldt vanaf een beeldverhouding van 6:5.
- **Smal** (telefoon, tot 560 px breed): kleinere tekst en alleen iconen in de navigatie.
- Past de inhoud niet, dan scrolt de weergave tussen de vaste header en navigatie.

## 3D-kaart met Mapbox

De kaart is een 3D-kaart van Mapbox GL JS (gebouwen in 3D, gekantelde camera). Je hebt een eigen publieke token nodig, anders blijft de SVG-placeholder staan.

1. Maak een gratis account op [mapbox.com](https://www.mapbox.com) en kopieer je **publieke** token (begint met `pk.`) van de pagina "Access tokens".
2. Beperk de token tot je eigen adressen, bijvoorbeeld `http://localhost:5188`.
3. Kopieer `js/config.example.js` naar `js/config.js` en vul de token in. `js/config.js` staat in `.gitignore`.
4. Herlaad de pagina. De bus rijdt dan als demo over de route van Kortrijk naar Menen en de camera volgt.

Wat er gebeurt in `js/map.js`:

- De route wordt opgehaald met de Directions API en getekend als gele lijn. Lukt dat niet, dan zie je rechte stukken tussen vier vaste punten.
- De 3D-gebouwen zijn een `fill-extrusion` laag onder de labels.
- De kaart is niet bedienbaar (`interactive: false`), zodat een klik doorgaat naar de link die naar de route leidt. De zoomknoppen werken wel.
- Dezelfde kaart verhuist naar het zichtbare kaartblok. Zo morpht het kaartblok van het overzicht naar de route.
- Het Mapbox-logo en de attributie blijven zichtbaar. Dat moet van de gebruiksvoorwaarden.

### Kleuren van de kaart aanpassen

De kleuren komen uit de CSS-tokens en volgen dus Day en Night. De koppeling staat in `applyTheme()` in `js/map.js`:

| Onderdeel | Token |
|---|---|
| Land en achtergrond | `--color-bg-raised` |
| Wegen en de rand van de route | `--color-bg-surface` |
| Water en gebouwen | `--color-bg-raised-pressed` |
| Route en bus | `--color-bg-accent` |
| Labels | `--color-text-secondary` |

Pas een token aan in `css/tokens.css` en de kaart verandert mee. Wil je meer controle, maak dan een eigen stijl in Mapbox Studio en zet de URL ervan in `STYLE` bovenaan `js/map.js`.

## Nog te doen

- De kaart is niet getest met een echte token: dat kon ik hier niet zonder jouw token.
- Het bereik, de batterij en de tijden zijn vaste waarden en lopen niet gelijk met de rijdende bus.
- De Night-versie is niet apart ontworpen voor elk detailscherm.
