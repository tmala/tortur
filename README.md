# ⛰️ Kart & Turposter i Norge (PWA)

En moderne, rask og installérbar **Progressive Web App (PWA)** bygget med **Vue 3**, **TypeScript**, **Vite** og **Leaflet**. Appen lar deg utforske interaktive kart over Norge og hele verden, finne din nøyaktige posisjon, og oppdage over **15 000 turposter og fjelltopper** i hele landet (datagrunnlag med utgangspunkt fra data hentet inn fra postkasetrimmen.no)

---

## 🌟 Hovedfunksjoner

### 1. 🗺️ 10 Forskjellige Kartlag

1. **Standard OpenStreetMap**: Raskt, detaljert og universelt verdenskart.
2. **Kartverket Norgeskart**: Offisielt norgeskart fra Kartverket med norske stedsnavn og terreng.
3. **Kartverket Sjøkart**: Offisielt sjøkart fra Kartverket med sjødybder, dybdekurver, fyrsektorer og sjømerker.
4. **Google Veikart**: Googles klassiske veikart med gater og interessepunkter.
5. **Google Satellitt (Hybrid)**: Ekte Google-satellittfoto med påførte veinavn og steder.
6. **Google Terreng**: Googles terrengkart med høydeforskjeller og topografi.
7. **Tur- & Sykkelkart (CyclOSM)**: Tydelige stier, sykkelruter og turveier.
8. **Topografisk (OpenTopoMap)**: Klassiske høydekonturer og terrengskygger.
9. **OpenSeaMap Sjøkart**: Sjøkart med fyr, bøyer og navigasjonsmerker.
10. **Satellitt & Flyfoto (Esri)**: Høyoppløselige flyfoto og satellittbilder fra Esri World Imagery. (inkluderer offisielle Geovekst-flyfoto i Norge).

### 2. 📍 Geolokasjon & Posisjonsvisning («Hvor er jeg?»)

- **Finn min posisjon**: Henter nøyaktige koordinater via enhetens GPS og animerer kartet slik at du plasseres midt i utsnittet.
- **Pulserende markør**: Egendefinert markør med radaranimasjon, retningsvisning (kompasskurs/heading) og nøyaktighetsradius (± meter).
- **«Følg meg»-modus**: Kontinuerlig sporing som holder kartet sentrert mens du beveger deg. Deaktiveres automatisk hvis du drar manuelt i kartet for å utforske andre områder.
- **Feilhåndtering**: Tydelige feilmeldinger på norsk ved manglende GPS-tillatelse eller tidsavbrudd.

### 3. ⛰️ Turposter i Norge (15 200+ registreringer)

- **Trinnvis filtrering**: Velg fylke, deretter kommune, for å laste inn turposter i det aktuelle området uten å overbelaste nettleseren.
- **Interaktivt søk**: Søk på navn på turpost/fjelltopp eller høyde over havet (`moh.`).
- **Hurtignavigasjon**: Klikk på en topp i listen for å fly direkte til den på kartet og åpne informasjonskortet.
- **Fjellmarkører (`⛰️`)**: Klikk på markører på kartet for å se toppnavn, høyde (`moh.`) og GPS-koordinater.

### 4. ⛵ Sanntids Båttrafikk (AIS / BarentsWatch & Kystverket)

- **Sanntids skipsdata**: Viser posisjoner, fart (`knop`), kurs (`°`), destinasjon og skipstype for fartøy i norske farvann.
- **Roterende båtsymboler**: Symbolene roterer dynamisk etter båtens kompasskurs.
- **Fargekoding etter fartøystype**:
  - 🔵 Passasjerskip / Ferger (f.eks. Kystruten / Hurtigruten, Fjord1)
  - 🟢 Lasteskip og bulkskip
  - 🟡 Tankskip
  - 🟠 Slepebåter og arbeidsbåter
  - 🔴 Redningsskøyter og Kystvakt
- **Smart Zoom-grense (Zoom $\ge$ 12)**: For å forhindre overbelastning og sikre lynrask ytelse, vises fartøyene kun når brukeren har zoomet inn på et nærområde (under ca. 20–30 km utsnitt). Zoomet lenger ut vises en hjelpetekst: *«AIS (Zoom inn)»*.
- **Fleksibel datakilde**: Støtter direkte tilkobling til Kystverkets/BarentsWatch API med egne gratis API-nøkler, eller en integrert demonstrasjonsstrøm.

### 5. 🗺️ Interaktive kommunegrenser & Klikk i kartet

- **GeoJSON-vektorlag**: Viser diskrete kommunegrenser for alle 357 norske kommuner.
- **Klikk-dialog**: Klikk hvor som helst innenfor en kommune på kartet for å åpne en dialogboks som viser fylke og antall turposter, med valg for:
  - **«⛰️ Vis turposter for [Kommune]»** (laster og viser postene).
  - **«✕ Skjul turposter»** (fjerner postene fra kartet hvis de allerede vises).

### 6. ⚡ Progressive Web App (PWA) & Offline Caching

- **Installérbar**: Kan installeres som frittstående app på mobil (iOS Safari, Android Chrome) og skrivebord (Chrome, Edge, Safari).
- **Service Worker Cache**: Cacher automatisk kartfliser, kommunegrenser og turpostdata for rask oppstart og bruk uten stabil nettforbindelse.

---

## 🏗️ Arkitektur og Prosjektstruktur

```
tortur/
├── data/
│   └── mountains.csv          # Rådata med 15 292 turposter (semikolon-separert)
├── public/
│   ├── icon.svg               # App-ikon for PWA
│   └── data/                  # Generert og optimalisert data for webappen
│       ├── hierarchy.json     # Indeks over fylker, kommuner og postantall (~12 KB)
│       ├── kommuner.geojson   # Kartverkets kommunegrenser i GeoJSON-format (~1.2 MB)
│       └── turposter/         # Individuelle JSON-filer per kommune (5–30 KB)
│           ├── vestland/
│           │   ├── luster.json
│           │   └── sogndal.json
│           └── ...
├── scripts/
│   └── build-data.js          # Byggeskript som parser CSV og genererer ren JSON
├── src/
│   ├── assets/
│   │   └── main.css           # Styling, mørkt tema, pulsanimasjoner og popup-stil
│   ├── components/
│   │   ├── MapViewer.vue      # Leaflet kartkomponent, markører, fliser og GeoJSON-lag
│   │   ├── LocationControls.vue # Flytende topp- og bunnpanel, GPS- og lagkontroller
│   │   └── TurposterPanel.vue # Slide-in panel for valg av fylke/kommune og søk i topper
│   ├── composables/
│   │   ├── useGeolocation.ts  # Henting av GPS-posisjon og kontinuerlig sporing
│   │   └── useTurposter.ts    # Laste- og oppslagslogikk for turposter og kommuner
│   ├── router/
│   │   └── index.ts           # Vue Router-konfigurasjon
│   ├── App.vue                # Hovedkomponent som binder kart, panel og logikk sammen
│   └── main.ts                # Applikasjonsinitialisering og Pinia/Router-oppsett
├── vite.config.ts             # Vite + VitePWA-oppsett med Workbox runtime caching
└── package.json
```

---

## ⚙️ Dataflyt og Hurtighet

For å sikre at appen laster umiddelbart på mobil og svake nettverk, er dataene fra `data/mountains.csv` splittet opp:

1. **`hierarchy.json`**: Liten oversiktsfil som lastes ved oppstart. Inneholder kun struktur over fylker og kommuner med tilhørende post-teller.
2. **`turposter/<fylke>/<kommune>.json`**: Når en bruker velger eller klikker på en kommune, hentes kun den spesifikke JSON-filen for den kommunen.
3. **ASCII-normalisering**: Mappe- og filnavn konverteres automatisk til standard ASCII-strenger (f.eks. `oestfold`, `moere-og-romsdal`, `luster`), noe som eliminerer URL-kodingsproblemer på tvers av nettlesere og webservere.
4. **Offline Service Worker**: Både kartfliser fra OSM/Kartverket og turpost-JSON lagres i lokal cache ved visning.

---

## 🚀 Komme i gang (Utvikling)

### Forutsetninger

- **Node.js** v22+ eller v24+
- **npm**

### 1. Klon prosjektet og installer avhengigheter

```bash
git clone <repository-url>
cd tortur
npm install
```

### 2. Generer datastrukturen fra CSV

Skriptet leser `data/mountains.csv`, laster ned kommunegrenser (hvis de mangler) og genererer filene i `public/data/`:

```bash
npm run build:data
```

### 3. Start utviklingsserveren

```bash
npm run dev
```

Åpne nettleseren på `http://localhost:5173`.

---

## 🧪 Tester og Kvalitetssikring

```bash
# TypeScript type-sjekk
npm run type-check

# Kjøre enhetstester (Vitest)
npm run test:unit

# Kjøre ende-til-ende tester (Playwright)
npm run test:e2e

# Kjøre linter (Oxlint / ESLint)
npm run lint
```

---

## 📦 Produksjonsbygg

Bygger applikasjonen, genererer PWA-manifest og Service Worker til `dist/`-mappen:

```bash
npm run build
```

Test produksjonsbygget lokalt:

```bash
npm run preview
```

---

## 📄 Lisenser og Datakilder

- **Kartdata & Fliser**: &copy; [OpenStreetMap](https://www.openstreetmap.org/copyright) bidragsytere, [Kartverket](https://www.kartverket.no), [OpenTopoMap](https://opentopomap.org), [CyclOSM](https://www.cyclosm.org), [Esri](https://www.esri.com).
- **Kommunegrenser**: Basert på administrative enheter fra [Kartverket / Geonorge](https://www.geonorge.no) (NLOD-lisens).
- **Turpostdata**: Hentet fra `data/mountains.csv`.
