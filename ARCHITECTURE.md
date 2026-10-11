# 🏛️ TorTur – Systemarkitektur og Dataflyt

Dette dokumentet beskriver den overordnede tekniske arkitekturen i **TorTur**, hvordan komponentene henger sammen, og hvordan data, sanntidssynkronisering, 3D-visualisering og sikkerhet håndteres mellom frontend, skytjenester og støtte-backends slik systemet er i drift i dag.

---

## 🗺️ 1. Helhetlig Systemarkitektur

Følgende diagram viser kjernekomponentene i TorTur-økosystemet i dag:

```mermaid
flowchart TD
    subgraph Klient ["📱 1. Klient (TorTur PWA)"]
        direction TB
        UI["Vue 3 + Vite PWA (trillebar.no)<br/><i>Vue Router & `<script setup lang='ts'>`</i>"]
        Store["Pinia Tilstand & Composables<br/><i>useAuth, useAis, useFriends, useTurposter,<br/>useGeolocation, usePrivateTurposter,<br/>useFirebaseTracks, useTrackPhotos</i>"]
        MapEngines["Kartmotorer & Visualisering<br/>• <b>Leaflet:</b> 2D hovedkart (10 lag, poster, AIS, spor)<br/>• <b>MapLibre GL:</b> 3D Flyover (terreng, bane, video)"]
        UI --> Store --> MapEngines
    end

    subgraph Backend ["⚡ 2. Backend-tjenester & API-mellomlag"]
        direction LR
        GCF["⚡ Google Cloud Function (Node.js 22)<br/><b>uploadCheckinImage</b><br/>• Bildeopplasting (multipart/form-data)<br/>• Sheets REST API (login, checkin, update, delete)"]
        FB["🔥 Firebase (europe-west1)<br/>• Firebase Auth (Google ID-token)<br/>• Realtime DB (sanntidssynk)"]
        AISProxy["🌐 BarentsWatch AIS-proxy<br/>• <b>bw-token.php / bw-ais.php</b> (Webhotell)<br/>• <b>barentsWatchAisDevPlugin</b> (Vite dev)"]
    end

    subgraph DataLagring ["💾 3. Skylagring & Datakilder"]
        direction LR
        GCloud["☁️ Google Cloud & Data<br/>• Google Drive (bilder per turpost)<br/>• Google Sheets (masterhistorikk & konfig)<br/>• Secret Manager (OAuth2 nøkler)"]
        BW["🚢 BarentsWatch API<br/>• Connect Token (id.barentswatch.no)<br/>• Live AIS (live.ais.barentswatch.no)"]
        Kart["🗺️ Karttjenester & Statiske Filer<br/>• Kartverket / OSM / Google / Esri fliser<br/>• Terrarium DEM (3D terrenghøyder)<br/>• Statiske turpost-JSON & kommunegrenser"]
    end

    %% Koblinger mellom lagene
    Store -->|"1. Turbilde & Sheets transaksjoner"| GCF
    Store -->|"2. Sanntid (innsjekk, venner, spor, forslag)"| FB
    Store -->|"3. Filtrert AIS båttrafikk"| AISProxy
    MapEngines -.->|"Laster kartfliser, terreng & data"| Kart

    GCF -->|"Lagrer bilde & rader"| GCloud
    AISProxy -->|"Henter nasjonal AIS-strøm"| BW
```

---

## 🔄 2. Dataflyt ved Innsjekking med Bilde

Innsjekkingsprosessen er optimalisert for minimal nettverksbelastning, sikker lagring av bilder og regnearkdata i Google Cloud, samt umiddelbar sanntidsvarsling til venner via Firebase:

```mermaid
sequenceDiagram
    autonumber
    actor Bruker as 🧗 Turgåer
    participant Klient as 📱 TorTur PWA
    participant GCF as ⚡ Cloud Function (europe-west1)
    participant Drive as 📁 Google Drive
    participant Sheets as 📊 Google Sheets
    participant Firebase as 🔥 Firebase RTDB

    Bruker->>Klient: Tar turbilde, skriver tekst, velger synlighet & trykker "Sjekk inn"
    Klient->>Klient: Komprimerer bilde lokalt i nettleseren (Canvas/WebP/JPEG via imageCompression.ts)

    rect rgb(14, 165, 233, 0.08)
    note over Klient,Drive: Steg A: Binæropplasting av bilde til Google Drive
    Klient->>GCF: POST /uploadCheckinImage (multipart/form-data: bilde, idToken, turpostId)
    GCF->>GCF: Verifiserer Google ID-token & sjekker ALLOWED_EMAILS
    GCF->>Drive: Oppretter/finner undermappe for turposten under INNSJEKK_FOLDER_ID
    GCF->>Drive: Laster opp bilde & setter lesetilgang (anyone with link)
    Drive-->>GCF: Bekrefter fil og fil-ID
    GCF-->>Klient: { success: true, imageUrl: "https://lh3.googleusercontent.com/d/...", fileId: "..." }
    end

    rect rgb(16, 185, 129, 0.08)
    note over Klient,Sheets: Steg B: Registrering i Google Sheets
    Klient->>GCF: POST /uploadCheckinImage (JSON action: "checkin", idToken, turpostId, imageUrl, beskrivelse)
    GCF->>GCF: Verifiserer ID-token
    GCF->>Sheets: appendRow til "TurpostInnsjekk" (UserID, TurpostID, Timestamp, BildeURL, CheckinID, etc.)
    Sheets-->>GCF: Rad bekreftet lagret
    GCF-->>Klient: { success: true, checkin: { ... } }
    end

    rect rgb(245, 158, 11, 0.08)
    note over Klient,Firebase: Steg C: Sanntidssynkronisering til venner og felles feed
    Klient->>Firebase: PUT /turposter/{turpostId}/{checkinId}.json (hvis offentlig)
    Klient->>Firebase: PUT /brukere/{userId}/checkins/{checkinId}.json
    Klient->>Firebase: PUT /checkins_visibility/{checkinId}.json (offentlig / venner / privat)
    Firebase-->>Klient: Synkronisering bekreftet
    Firebase-)Klient: Sanntidsoppdatering propageres til alle tilkoblede venner
    end

    Klient-->>Bruker: ✅ Innsjekking fullført og markert på kartet!
```

---

## 🚢 3. Dataflyt for BarentsWatch AIS (Sanntids Båttrafikk)

For å vise levende skips- og fergetrafikk langs norskekysten uten å utsette mobilklienten for overveldende datamengder eller CORS-problemer, benyttes en server-side proxy med diskcache og geografisk avgrensning:

```mermaid
sequenceDiagram
    autonumber
    actor Bruker as 🗺️ Bruker i kartet
    participant Klient as 📱 TorTur PWA (useAis)
    participant AISProxy as 🛰️ AIS Proxy (PHP / Vite Dev)
    participant BW as 🌐 BarentsWatch API

    Bruker->>Klient: Zoomer inn i kartet (Zoom >= 12) & aktiverer AIS
    Klient->>Klient: Beregner kartutsnitt (bounds) med 40% sikkerhetsbuffer (expandBounds)

    rect rgb(99, 102, 241, 0.08)
    note over Klient,AISProxy: 1. Token-innhenting & Proxy-forespørsel
    Klient->>AISProxy: POST /bw-ais med bounds og Bearer token
    end

    rect rgb(16, 185, 129, 0.08)
    note over AISProxy,BW: 2. Henting og server-filtrering av fartøyer
    alt Servercache er fersk (alder <= 25 sekunder)
        AISProxy->>AISProxy: Leser hurtigbuffer fra minne/disk
    else Cache utløpt eller mangler
        AISProxy->>BW: GET https://live.ais.barentswatch.no/v1/latest/combined
        BW-->>AISProxy: Nasjonal rå AIS-feed (tusener av fartøy i hele Norge)
        AISProxy->>AISProxy: Lagrer rå respons i hurtigbuffer (25s TTL)
    end

    AISProxy->>AISProxy: Filtrerer fartøy: beholder kun de innenfor klientens bounds
    AISProxy-->>Klient: JSON med kun fartøyer i aktuelt nærområde
    end

    Klient->>Klient: Oppdaterer Leaflet med roterende skipsikoner, fart, kurs og status
    Klient-->>Bruker: ⛵ Båter og ferger oppdatert i kartet!
```

---

## 🚁 4. GPS-spor, Geotaggede Turbilder og 3D Flyover

TorTur har et komplett økosystem for innspilling, lagring, berikelse og visualisering av turer:

```mermaid
flowchart TD
    subgraph DataInnsamling ["📍 1. Datafangst & Import"]
        GPS["Enhetens GPS<br/><i>useGeolocation (sanntidsopptak)</i>"]
        GPX["GPX / GeoJSON-filer<br/><i>gpxParser.ts (import fra klokke/app)</i>"]
        Photos["Enhetens Turbilder<br/><i>useTrackPhotos.ts (EXIF GPS-uttrekk)</i>"]
    end

    subgraph Prosessering ["⚙️ 2. Prosessering & Kobling"]
        TrackStore["gpsTrack Store (Pinia)<br/>• Aktiv rute & høydeprofil<br/>• Kilometer-markører (trackKmMarkers.ts)"]
        PhotoMatch["Bilde-matching<br/>• Sjekker avstand mot sporet (isPhotoNearTrack)<br/>• Klynging av bilder (trackPhotoCluster.ts)"]
        SplinePath["3D Baneberegning (flyoverPath.ts)<br/>• Catmull-Rom spline interpolering<br/>• Glatting av kurver & stigningsgrad"]
        GPS --> TrackStore
        GPX --> TrackStore
        Photos --> PhotoMatch
        TrackStore --> PhotoMatch
        TrackStore --> SplinePath
    end

    subgraph Visualisering ["🎬 3. Visualisering & Eksport"]
        Leaflet2D["2D Kartavspiller (TrackPlaybackPanel.vue)<br/>• Scrubber, fart 1x-20x, play/pause<br/>• Interaktiv høydeprofil & fotomarkører"]
        Flyover3D["3D Flyover (MapLibre GL / TrackFlyoverView.vue)<br/>• Terrarium DEM 3D terreng<br/>• Kameramodi (fugleperspektiv, 3. person, dynamisk)<br/>• HUD med fart, stigning og høyde"]
        VideoRecord["Videoeksport (MediaRecorder)<br/>• Tar opp 3D flyover til WebM-video<br/>• Kan lastes ned eller deles"]
        TrackStore --> Leaflet2D
        PhotoMatch --> Leaflet2D
        SplinePath --> Flyover3D --> VideoRecord
    end
```

### Kjernekomponenter i 3D Flyover-motoren:

1. **Catmull-Rom Spline-interpolering (`flyoverPath.ts`)**:
   - Rå GPS-punkter kan ha varierende tidsintervaller og mikrobevegelser.
   - Algoritmen resampler og jevner ut sporet med jevne avstander (f.eks. hver 8. meter) og beregner tangentvektorer for kurs (bearing), helling (pitch) og stigningsgradient.
2. **MapLibre GL & 3D Terreng (`useFlyoverMap.ts`, `flyoverTileSources.ts`)**:
   - Benytter Terrarium/Mapzen raster-DEM (Digital Elevation Model) for å bygge et fotorealistisk 3D-terreng.
   - Kombinerer dette med høyoppløselige satellitt- eller topografiske kartfliser.
3. **Kamerakontroller (`useFlyoverCamera.ts`)**:
   - Støtter tre moduser: **Fugleperspektiv** (oversikt ovenfra), **Tredjeperson** (plassert bak/over turgåeren i fartsretningen) og **Dynamisk** (varierer vinkel og avstand etter terreng og svinger).
4. **Synkronisert HUD og Avspiller (`useFlyoverPlayback.ts`, `FlyoverHud.vue`)**:
   - Styres av `requestAnimationFrame` med `performance.now()` for stabil bildefrekvens.
   - Viser sanntids høyde over havet, stigningsprosent, fart, distanse og fremdrift langs høydeprofilen.
5. **Innebygd Videoopptak**:
   - Tar opp MapLibre-lerretet direkte til WebM-videofil via nettleserens `MediaRecorder`-API.

---

## 📍 5. Private Turposter og Forslagssystem

For å utvide kartet utover de 15 200 faste turpostene fra postkassetrimmen, tilbyr systemet to parallelle spor:

1. **Private Turposter («Mine steder» / `usePrivateTurposter.ts`)**:
   - Opprettes enkelt ved å holde fingeren nede på kartet (langtrykk) eller høyreklikke med musen.
   - Lagres under brukerens private node i Firebase: `/<prefix>/brukere/{userId}/my_spots/{spotId}.json`.
   - Kun synlige for den innloggede brukeren via strenge Firebase-sikkerhetsregler.
   - Brukeren kan sjekke inn på egne private turposter med bilder og notater.
2. **Forslag til Offentlige Turposter (`/forslag` / `SpotSuggestionsView.vue`)**:
   - Brukere kan foreslå nye poster til felleskartet.
   - **Automatisk plassering i CSV**: Systemet analyserer eksisterende `mountains.csv` og beregner nøyaktig linjenummer der posten hører hjemme alfabetisk under riktig kommune (`CsvPlacementResult`).
   - Forslag lagres i `/<prefix>/spot_suggestions/{id}.json` med status `pending`.
   - Administratorer kan godkjenne eller avvise forslag direkte i appen:
     - **Godkjenning**: Posten lagres i `/<prefix>/approved_spots/{id}.json` og vises umiddelbart for alle innloggede brukere på kartet som offentlig turpost. Innsenderens egen oppføring oppdateres automatisk til status `approved` med «Godkjent av admin»-badge.
     - **Avvisning**: Forslaget merkes som `denied` og oppdaterer brukerens oppføring til «Avvist».
   - **Eksport til `mountains.csv`**:
     - Kjøres med `npm run sync:spots`. Skriptet henter ueksporterte godkjente turposter fra `approved_spots`, fletter dem alfabetisk inn i `data/mountains.csv`, og markerer dem som `status: 'exported'` (`exportedToCsv: true`).
     - Deretter kjøres `npm run build` (som regenererer JSON-filer og hierarki) før manuell publisering.

---

## 🔐 6. Sikkerhetsmodell og Nøkkelhåndtering

| Komponent | Sikkerhetsmekanisme | Beskrivelse |
|---|---|---|
| **Google Cloud Function** | **Secret Manager & ADC** | Kjører under en dedikert Google Service Account med rollen `Secret Manager Secret Accessor`. Henter OAuth2 Refresh Token for Google Drive ved behov og benytter Application Default Credentials (ADC) for Google Sheets API. Verifiserer innkommende `idToken` via `google-auth-library` og begrenser tilgang via `ALLOWED_EMAILS`. |
| **Google Drive** | **Strukturert tilgangsstyring** | Bildene lagres i undermapper per turpost under en fast hovedmappe (`INNSJEKK_FOLDER_ID`). Cloud Function setter leserettighet for alle med lenken (`anyone with link`), slik at bildene kan vises i PWA-en uten å eksponere skrive- eller slettetilgang. |
| **Google Sheets** | **Skjermet databaselag** | Ingen direkte tilgang fra nettleseren. All lesing og skriving skjer via Cloud Function. |
| **Webklient (PWA)** | **Google Identity Services (GIS)** | Bruker logger inn med offisiell Google OAuth2. `id_token` lagres i `sessionStorage` og benyttes som bærer-token mot både Cloud Function og Firebase Authentication. |
| **Firebase Realtime Database** | **Finkornet regelsett** | Regelsett i [database.rules.json](file:///Users/mala/work/github/tortur/database.rules.json) sikrer: <br/>• Autentiserte brukere kan lese felles turposter, godkjente turposter (`approved_spots`) og skrive likes/kommentarer.<br/>• Brukerspesifikke data (`checkins`, `my_spots`, `tracks`, `track_photos`) er låst til brukerens egen `auth.uid`.<br/>• Innsjekkinger og spor deles selektivt med godkjente venner basert på vennelister.<br/>• Forslag til turposter (`spot_suggestions`) er skjermet, og kun administratorer har skrivetilgang til `approved_spots` via `admins`-noden. |
| **BarentsWatch Proxier** | **Server-side Proxy & Caching** | Produksjon: [bw-token.php](file:///Users/mala/work/github/tortur/public/api/bw-token.php) og [bw-ais.php](file:///Users/mala/work/github/tortur/public/api/bw-ais.php) på webhotell hindrer CORS-problemer og beskytter API-et via 25s diskcache og bounding box-filter.<br/>Utvikling: `barentsWatchAisDevPlugin` i [vite.config.ts](file:///Users/mala/work/github/tortur/vite.config.ts) gir samme opplevelse lokalt. |

---

## 📁 7. Komponent- og Katalogstruktur

Oversikt over systemets oppbygning:

```
tortur/
├── src/
│   ├── App.vue                      # Rotkomponent med Vue Router <RouterView />
│   ├── main.ts                      # App-initialisering (Vue, Pinia, Router)
│   ├── types.ts                     # Sentrale TypeScript-domenetypedefinisjoner
│   ├── router/
│   │   └── index.ts                 # Vue Router: ruter for kart, profil, venner, spor, 3D
│   ├── views/
│   │   ├── MapView.vue              # Hovedvisning: 2D Leaflet-kart, lag, kontroller, AIS
│   │   ├── ProfileView.vue          # Brukerprofil og innsjekkingshistorikk
│   │   ├── FriendsView.vue          # Venneliste, søk og venneforespørsler
│   │   ├── FriendProfileView.vue    # Visning av en venns profil og turer
│   │   ├── MySpotsView.vue          # Administrasjon av egne private turposter
│   │   ├── GpsTracksView.vue        # Bibliotek over lagrede GPS-spor
│   │   ├── SpotSuggestionsView.vue  # Administrasjon av turpost-forslag
│   │   └── TrackFlyoverView.vue     # 3D Flyover-visning med MapLibre GL og videoopptak
│   ├── components/
│   │   ├── MapViewer.vue            # Leaflet kartflate, markører og hendelseshåndtering
│   │   ├── MapContextMenu.vue       # Kontekstmeny ved langtrykk/høyreklikk i kartet
│   │   ├── MapLayerButton.vue       # Hurtigknapp for valg av kartlag
│   │   ├── AppHeader.vue            # Hovedheader med status, innlogging og meny
│   │   ├── LocationControls.vue     # GPS-posisjonsknapp og «Følg meg»-indikator
│   │   ├── TurposterPanel.vue       # Fylkes- og kommunevelger med søk og filter
│   │   ├── TurpostCheckinsModal.vue # Alle innsjekkinger på en valgt turpost
│   │   ├── CheckinModal.vue         # Innsjekkingsdialog med bildekomprimering
│   │   ├── EditCheckinModal.vue     # Redigering og sletting av egne innsjekkinger
│   │   ├── CheckinSocialSection.vue # Likes (emojis) og kommentarer på innsjekkinger
│   │   ├── AddTurpostModal.vue      # Dialog for å legge til privat post eller forslag
│   │   ├── TrackPlaybackPanel.vue   # 2D GPS-spor avspiller med høydeprofil
│   │   ├── TrackPhotosSection.vue   # Geotaggede turbilder koblet mot GPS-rute
│   │   ├── GpsTrackModal.vue        # Opptak, import og administrasjon av GPS-spor
│   │   ├── checkin/                 # Modulære innsjekkingskomponenter (WebcamCapture, etc.)
│   │   ├── flyover/                 # 3D Flyover-komponenter:
│   │   │   ├── FlyoverMap.vue       # MapLibre GL 3D lerret
│   │   │   ├── FlyoverControls.vue  # Avspillingskontroller, fart og kameramodi
│   │   │   ├── FlyoverHud.vue       # Sanntids HUD (høyde, fart, stigning, tid)
│   │   │   └── ElevationProfile.vue # Interaktiv høydeprofil med markør
│   │   ├── friends/                 # Modulære vennefaner (lister, søk, forespørsler)
│   │   ├── header/                  # Modulære header-elementer (AisInfoModal, etc.)
│   │   └── profile/                 # Profilkomponenter og innsjekkingskort
│   ├── composables/
│   │   ├── useAuth.ts               # Google OAuth2, innsjekk, Cloud Function API
│   │   ├── useAis.ts                # BarentsWatch AIS: båtsporing, buffer og proxy
│   │   ├── useFriends.ts            # Venneforespørsler, vennefeed og profilsynk
│   │   ├── useTurposter.ts          # Turpostdata, fylker, kommuner og hierarki
│   │   ├── useGeolocation.ts        # Enhetens GPS-posisjon og «Følg meg»-sporing
│   │   ├── useGeoDetect.ts          # Automatisk kommune- og utlandsdeteksjon
│   │   ├── useCheckinSocial.ts      # Emoji-reaksjoner og kommentarer i Firebase
│   │   ├── usePrivateTurposter.ts   # Private turposter («Mine steder») og forslag
│   │   ├── useFirebaseTracks.ts     # Lagring og deling av GPS-spor i Firebase
│   │   ├── useTrackPhotos.ts        # EXIF GPS-uttrekk og kobling av bilder til ruter
│   │   ├── useAppUpdate.ts          # PWA Service Worker oppdateringsvarsler
│   │   ├── map/                     # Kart-composables:
│   │   │   ├── useMapAisLayer.ts    # AIS båtlag med roterende ikoner
│   │   │   ├── useMapLongpress.ts   # Langtrykk- og høyreklikksdeteksjon
│   │   │   ├── useMapMunicipalitiesLayer.ts # GeoJSON kommunegrenser
│   │   │   └── useMapTrackLayer.ts  # GPS-sporalag og kilometer-markører
│   │   └── flyover/                 # 3D Flyover-composables:
│   │       ├── useFlyoverMap.ts     # MapLibre GL initialisering og terreng
│   │       ├── useFlyoverCamera.ts  # Kamerabevegelser og moduser
│   │       └── useFlyoverPlayback.ts # requestAnimationFrame avspillingsløkke
│   ├── stores/
│   │   ├── appState.ts              # Global applikasjonstilstand og modaler
│   │   └── gpsTrack.ts              # Aktivt GPS-spor, høydeprofil og tilstand
│   ├── config/
│   │   └── mapLayers.ts             # Definisjon av de 10 kartlagene og rettigheter
│   └── utils/
│       ├── flyoverPath.ts           # Catmull-Rom spline, sampling og kurveglatting
│       ├── flyoverTileSources.ts    # 3D terreng- og flisekilder (Terrarium DEM)
│       ├── gpxParser.ts             # GPX/GeoJSON-parsing til GPS-punkter
│       ├── imageCompression.ts      # Klientside bildekomprimering før opplasting
│       ├── mapIcons.ts              # Egendefinerte Leaflet DivIcon markører
│       ├── mapTileLayers.ts         # TileLayer-oppsett for Leaflet
│       ├── trackKmMarkers.ts        # Kilometer-markører langs spor
│       ├── trackPhotoCluster.ts     # Klynging av turbilder langs ruter
│       └── trackPlayback.ts         # 2D GPS-spor avspillingslogikk
├── scripts/
│   ├── drive-upload-function/       # Google Cloud Function (Node.js v22)
│   │   ├── src/
│   │   │   ├── index.js             # HTTP-endepunkt for multipart og JSON API
│   │   │   ├── auth.js              # Secret Manager og Google Service Account auth
│   │   │   ├── driveService.js      # Google Drive v3 API (mapper & opplasting)
│   │   │   └── sheetsService.js     # Google Sheets API (login, checkin, update, delete)
│   │   ├── deploy.sh                # Distribusjonsskript for Cloud Function
│   │   └── package.json             # Node.js 22 avhengigheter
│   └── build-data.js                # Genererer turpost-JSON per kommune fra CSV
├── public/
│   ├── api/                         # PHP-proxier for webhotell i produksjon
│   │   ├── bw-token.php             # BarentsWatch OAuth2 Token proxy
│   │   └── bw-ais.php               # BarentsWatch AIS proxy med 25s cache og bbox
│   └── data/                        # Statisk generert datagrunnlag for PWA
│       ├── hierarchy.json           # Oversikt over fylker, kommuner og post-antall
│       ├── kommuner.geojson         # Kartverkets kommunegrenser
│       └── turposter/               # Individuelle JSON-filer per kommune
├── vite.config.ts                   # Vite-konfig, PWA-oppsett og lokal AIS Dev Plugin
└── database.rules.json              # Sikkerhetsregler for Firebase Realtime Database
```

---

## 💡 8. Hvorfor denne arkitekturen?

1. **Skalerbar serverless backend i skyen**:
   - Google Cloud Function (gen 2, Node.js 22) håndterer både rå bildeopplasting til Google Drive og databasetransaksjoner mot Google Sheets uten behov for egne servere som krever vedlikehold.
2. **Minimal belastning på mobilbåndbredde**:
   - Bildene komprimeres lokalt i nettleseren før opplasting.
   - Webhotellet leverer primært statiske ressurser og en lett mellomlagret AIS-proxy.
3. **Smart AIS-optimalisering**:
   - Både i produksjon (PHP) og under lokal utvikling ([vite.config.ts](file:///Users/mala/work/github/tortur/vite.config.ts)) filtreres den nasjonale skipsstrømmen geografisk mot brukerens kartutsnitt og caches i 25 sekunder. Dette kutter datamengden fra megabytes til få kilobytes.
4. **Hybrid datamodell (Permanent historikk + lynrask sanntid)**:
   - **Google Sheets**: Tilgjengelig, reviderbar master-database for brukere og innsjekkingshistorikk.
   - **Firebase Realtime Database**: Sub-sekunds toveis synkronisering for sosiale interaksjoner, venneoppdateringer, kommentarer, likes, GPS-spor og forslag.
5. **Doble kartmotorer for optimal opplevelse**:
   - **Leaflet** gir et lynraskt, responsivt og batterivennlig 2D-hovedkart på mobil for daglig bruk og innsjekk.
   - **MapLibre GL** aktiveres on-demand for krevende 3D-terrengoverflyving av GPS-spor med mulighet for videoeksport.
6. **Robust offline- og PWA-opplevelse**:
   - Data er delt inn per kommune og caches automatisk av Service Worker via Workbox, slik at appen fungerer selv i områder med dårlig eller fraværende mobildekning.
