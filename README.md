# ⛰️ TorTur – Turposter & GPS-opplevelser

En moderne **Progressive Web App (PWA)** bygget med **Vue 3 (Composition API & `<script setup lang="ts">`)**, **TypeScript**, **Vite**, **Leaflet** og **MapLibre GL** (3D Flyover). Appen lar deg utforske interaktive kart over Norge og utvalgte områder globalt, finne din nøyaktige posisjon, ta opp og spille av GPS-spor, se turbilder langs ruten, sjekke inn på over **15 000 turposter og fjelltopper** i hele landet og utvalgte områder globalt (med datagrunnlag fra postkassetrimmen.no), opprette egne private turposter, og oppleve turene dine med en **3D Flyover** som kan eksporteres.

---

## 🌟 Hovedfunksjoner

### 1. 🗺️ Forskjellige Kartlag

TorTur støtter et utvalg kartlag for å gjøre det enkelt å finne fram på tur.

1. **Kartverket Norgeskart** (Standard): Offisielt detaljert norgeskart fra Kartverket med norske stedsnavn og terreng.
2. **Topografisk (OpenTopoMap)**: Klassiske høydekonturer, terrengskygger og topografi.
3. **Standard OpenStreetMap**: Raskt, detaljert og universelt verdenskart.
4. **Satellitt & Flyfoto (Esri)**: Høyoppløselige flyfoto og satellittbilder fra Esri World Imagery (inkluderer offisielle Geovekst-flyfoto i Norge).
5. **Tur- & Sykkelkart (CyclOSM)**: Tydelige stier, sykkelruter og turveier.
6. **Kartverket Sjøkart**: Offisielt sjøkart fra Kartverket med dybder, dybdekurver, fyrsektorer og sjømerker.
7. **OpenSeaMap Sjøkart**: Globalt sjøkart med fyr, bøyer og navigasjonsmerker.
8. **Google Veikart**: Googles klassiske veikart med gater og interessepunkter *(krever innlogging og admin-tilgang)*.
9. **Google Satellitt (Hybrid)**: Ekte Google-satellittfoto med påførte veinavn og steder *(krever innlogging og admin-tilgang)*.
10. **Google Terreng**: Googles terrengkart med høydeforskjeller *(krever innlogging og admin-tilgang)*.

- **Smart utlandsdeteksjon**: Hvis brukeren befinner seg utenfor Norges grenser, detekteres dette automatisk via koordinatene, og kartet skifter sømløst fra Kartverket Norgeskart til OpenStreetMap for optimal visning.

---

### 2. 📍 Geolokasjon, Posisjonsvisning & Hurtigmeny

- **Finn min posisjon**: Henter nøyaktige koordinater via enhetens GPS og sentrerer kartet med jevn animasjon.
- **Pulserende markør**: Egendefinert markør med radaranimasjon, retningsvisning (kompasskurs/heading) og nøyaktighetsradius (± meter).
- **Kontekstmeny i kartet (Høyreklikk / Langtrykk)**: Langtrykk på berøringsskjerm eller høyreklikk med mus åpner en kontekstmeny der du kan opprette en turpost direkte på punktet, sjekke inn, eller kopiere GPS-koordinater.
- **Automatisk kommune-gjenkjenning**: Finner automatisk ut hvilken kommune du befinner deg i basert på Kartverkets administrative grenser.

---

### 3. ⛰️ Turposter (15 200+ registreringer)

- **Trinnvis filtrering**: Velg fylke, deretter kommune, for å laste inn turposter i det aktuelle området uten å overbelaste nettleseren eller mobilminnet.
- **Interaktivt søk**: Søk på navn på turpost/fjelltopp.
- **Hurtignavigasjon**: Klikk på en topp i listen for å fly direkte til den på kartet og åpne detaljkortet.
- **Fjellmarkører (`⛰️`)**: Klikk på markører på kartet for å se navn, høyde (`moh.`), fylke, kommune og GPS-koordinater.
- **Innsjekksoversikt per turpost**: Se hvem som har sjekket inn på posten, se turbilder, les turbeskrivelser og legg igjen kommentarer.

---

### 4. 📍 Mine Turposter & Forslag til Nye Poster

- **Mine Turposter («Mine steder»)**: Opprett egne private turposter.
- **Forslagssystem for fellesskapet**: Foreslå nye offentlige turposter direkte fra appen.

---

### 5. 🥾 GPS-spor, Ruteopptak & Geotaggede Turbilder

- **Import av GPX og GeoJSON**: Importer eksisterende turer fra smartklokker (Garmin, Polar, Apple Watch) eller turapper.
- **Interaktiv 2D-spiller**: Spill av turen på kartet med justerbar hastighet (1x–20x), scrubber, kilometer-markører og dynamisk høydeprofil.
- **Geotaggede turbilder langs ruten**: Velg bilder tatt under turen. Appen leser automatisk EXIF GPS-metadata (`exifr`) og matcher bildene mot GPS-sporet. Bildene vises som fotomarkører langs ruten på kartet med forhåndsvisning.

---

### 6. 🚁 3D Flyover & Videoeksport (MapLibre GL)

- **Virtuell 3D-overflyving**: Se GPS-sporet ditt i et fullt 3D-terreng med satellitt- eller topografiske kartfliser ved hjelp av MapLibre GL.
- **Smidig baneinterpolering**: Sporet interpoleres med Catmull-Rom-splines for cinematiske kamerabevegelser uten hakking.
- **Fleksible kameramodi**:
  - *Fugleperspektiv (Top-down)*
  - *Tredjeperson (Bak løperen/turgåeren)*
  - *Dynamisk/Cinematisk modus*
- **Flyover HUD**: Viser sanntids høyde over havet, stigningsprosent, fart, distanse og tidsbruk.
- **Innebygd videoopptak**: Ta opp hele overflyvingen direkte i nettleseren via `MediaRecorder` og last ned en ferdig videofil (WebM).
- **Popout-støtte**: Kan kjøres i fullskjerm, i modal, eller spretter ut i et eget separat nettleservindu.

---

### 7. ⛵ Sanntids Båttrafikk (AIS / BarentsWatch & Kystverket)

- **Sanntids skipsdata**: Viser posisjoner, fart (`knop`), kurs (`°`), destinasjon og skipstype for fartøy i norske farvann.
- **Roterende båtsymboler**: Symbolene roterer dynamisk etter båtens kompasskurs.
- **Fargekoding etter fartøystype**:
  - 🔵 Passasjerskip / Ferger (f.eks. Hurtigruten, Havila, Fjord1)
  - 🟢 Lasteskip og bulkskip
  - 🟡 Tankskip
  - 🟠 Slepebåter og arbeidsbåter
  - 🔴 Redningsskøyter og Kystvakt
- **Smart Zoom-grense (Zoom $\ge$ 12)**: Vises kun ved tilstrekkelig innzooming for å sikre lynrask ytelse på mobil.
- **Server-side Bounding Box & 25s Cache**: Både på webhotellet (PHP) og under lokal utvikling (Vite Dev Plugin) caches og filtreres den nasjonale AIS-strømmen slik at mobilen kun mottar båtene i aktuelt kartutsnitt.

---

### 8. 🗺️ Interaktive Kommunegrenser & GeoJSON

- **Diskrete kommunegrenser**: Viser vektorbaserte grenser for alle Norges kommuner.
- **Klikk i kartet**: Klikk innenfor en kommune for å se fylkestilhørighet, antall turposter, og hurtigvalg for å vise eller skjule turpostene på kartet.

---

### 9. 📸 Innsjekking & Turbilder (Google Drive & Sheets)

- **Registrer turpostbesøk**: Dato, klokkeslett, personlig turbeskrivelse og turbilde.
- **Klientside bildekomprimering**: Bilder komprimeres automatisk i nettleseren før opplasting for å spare mobildata og sikre rask respons.
- **Google Cloud Function**: Bildet overføres som rå binærfil via `multipart/form-data` til en serverless Cloud Function (Node.js 22) som lagrer det strukturert i Google Drive (undermapper per turpost).
- **Redigering og sletting**: Brukere kan i ettertid redigere turbeskrivelsen, endre synlighet eller slette egne innsjekkinger.

---

### 10. 👥 Venner, Profiler & Sanntidssynkronisering (Firebase)

- **Google-innlogging (GIS)**: Sikker innlogging med offisiell Google Identity Services OAuth 2.0.
- **Dobbelt lagringslag**: Innsjekkingen lagres sikkert i Google Sheets og propageres umiddelbart til **Firebase Realtime Database**.
- **Synlighetskontroll**: Velg om innsjekkinger skal være offentlige, kun synlige for venner, eller helt private.
- **Sosiale interaksjoner**: Vennefeed, venneforespørsler, emoji-reaksjoner og kommentarer på tvers av innsjekkinger.

---

### 11. ⚡ PWA & Frakoblet bruk (Offline Caching)

- **Installérbar**: Fungerer som en fullverdig frittstående app på mobil (iOS Safari, Android Chrome) og datamaskin (Chrome, Edge, Safari).
- **Service Worker Cache (Workbox)**: Cacher automatisk kartfliser, kommunegrenser og turpost-JSON.
- **Oppdateringsvarsel**: Appen oppdager automatisk nye versjoner og gir brukeren et diskret varsel om å oppdatere (`useAppUpdate`).

---

## 🧭 Ruting og Navigasjon

Appen benytter **Vue Router** med rene URL-stier for enkel deling og bokmerking:

| Sti | Visning | Beskrivelse |
|---|---|---|
| `/` | `MapView.vue` | Hovedkartet med Leaflet, turposter, lagvelger og AIS |
| `/profil` | `ProfileView.vue` | Brukerprofil, innsjekkingsstatistikk og personlige turer |
| `/venner` | `FriendsView.vue` | Venneliste, vennefeed, søk og venneforespørsler |
| `/venner/:userId` | `FriendProfileView.vue` | Se en venns offentlige profil og innsjekkinger |
| `/mine-turposter` | `MySpotsView.vue` | Administrer egne private turposter («Mine steder») |
| `/gps-spor` | `GpsTracksView.vue` | Bibliotek over lagrede GPS-spor med avspilling og eksport |
| `/forslag` | `SpotSuggestionsView.vue` | Administrasjon og innsending av forslag til turposter |
| `/spor-3d` | `TrackFlyoverView.vue` | 3D Flyover-visning med MapLibre GL og videoopptak |

---

## ⚙️ Dataflyt og Hurtighet

For å sikre at appen laster umiddelbart på mobil og svake nettverk, er turpostdataene fra `data/mountains.csv` optimalisert:

1. **`hierarchy.json`**: Liten oversiktsfil (~15 KB) som lastes ved oppstart. Inneholder kun struktur over fylker og kommuner med tilhørende post-teller.
2. **`turposter/<fylke>/<kommune>.json`**: Når en bruker velger en kommune, hentes kun den spesifikke JSON-filen for det aktuelle området.
3. **ASCII-normalisering**: Mappe- og filnavn konverteres automatisk til standard ASCII-strenger (f.eks. `oestfold`, `moere-og-romsdal`, `luster`), noe som eliminerer URL-kodingsproblemer på tvers av nettlesere og webservere.
4. **Offline Service Worker**: Både kartfliser fra OSM/Kartverket og turpost-JSON lagres i lokal cache ved visning.

---

## 🏗️ Arkitektur og Prosjektstruktur

> [!TIP]
> For en komplett teknisk gjennomgang med detaljerte Mermaid-diagrammer over dataflyt, sikkerhetsmodeller og skytjenester, se [ARCHITECTURE.md](file:///Users/mala/work/github/tortur/ARCHITECTURE.md).

---

## 🚀 Komme i gang (Utvikling)

### Forutsetninger

- **Git**
- **Node.js** v22+ eller v24+
- **npm**
- **Google Cloud Account** (for produksjonsdrift)
  - Google Cloud Project med en Google OAuth 2.0 Client
  - Firebase Realtime Database
  - Cloud Function (gen 2, Node.js 22)
- **Webhotell** med PHP (for produksjonsdrift av AIS-proxy og statisk hosting)

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

Åpne nettleseren på `http://localhost:5173/tortur/`.

> [!NOTE]
> Under lokal utvikling (`npm run dev`) sørger den innebygde Vite-pluginen `barentsWatchAisDevPlugin` automatisk for lokal proxying og 25s caching av BarentsWatch AIS-data, slik at du ikke trenger å sette opp en lokal PHP-server!

---

## 🧪 Tester og Kvalitetssikring

Prosjektet har strenge krav til typesikkerhet og kodekvalitet (ingen `any` tillatt):

```bash
# TypeScript type-sjekk (vue-tsc)
npm run type-check

# Kjøre enhetstester (Vitest)
npm run test:unit

# Kjøre ende-til-ende tester (Playwright)
npm run test:e2e

# Kjøre linter (ESLint med type-sjekk)
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
- **Turpostdata**: Hentet fra `data/mountains.csv` med utgangspunkt fra postkassetrimmen.no.
- **AIS Skipsdata**: Levert av [BarentsWatch](https://www.barentswatch.no) og [Kystverket](https://www.kystverket.no) via åpent API (NLOD-lisens).
