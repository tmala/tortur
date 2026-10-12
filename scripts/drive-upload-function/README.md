# TorTur – Google Cloud Function for Bildeopplasting & Sheets API

Erstatter både Google Apps Script og PHP-backend med en lynrask, samlet Google Cloud Function (gen 2) på Node.js 22 i `europe-west1`.

Funksjonen håndterer to kjerneoppgaver:

1. **Bildeopplasting til Google Drive**: Ekte binær `multipart/form-data` uten Base64-overhead, mapper per turpost og delingslenker.
2. **TorTur Backend API (Google Sheets)**: Innlogging/bruker-whitelist, innsjekk, sletting, oppdatering og systemkonfigurasjon direkte mot Google Sheets API v4 over Googles interne fiber.

---

## Mappestruktur

```
scripts/drive-upload-function/
├── src/
│   ├── index.js          # Cloud Function HTTP entry point (uploadCheckinImage)
│   ├── auth.js           # Henter tokens (Drive OAuth2 + Sheets ADC/Service Account)
│   ├── driveService.js   # Google Drive API v3 opplasting, deling og sletting
│   └── sheetsService.js  # Google Sheets API v4 (login, checkin, delete, update, config)
├── test/
│   ├── upload.html       # Manuell testside (Multipart/form-data)
│   └── upload-base64.html# Sammenligningstest (Base64 JSON)
├── .gcloudignore         # Filer som ekskluderes fra deploy
├── package.json          # Node.js 22 dependencies
├── deploy.sh             # Ett-klikks deploy-skript for europe-west1
└── README.md             # Denne veiledningen
```

---

## 🛠️ Forutsetninger og oppsett i Google Cloud Console

Følg disse 3 enkle stegene i Google Cloud Console:

### Steg 1: Aktiver Google Sheets API

1. Gå til [Google Cloud Console – API Library](https://console.cloud.google.com/apis/library).
2. Pass på at du er i det prosjektet du ønsker å bruke.
3. Søk etter **Google Sheets API**.
4. Klikk på **Google Sheets API** og trykk **Enable** (Aktiver).
   _(Alternativt i terminalen: `gcloud services enable sheets.googleapis.com`)_

### Steg 2: Gi Cloud Function tilgang til Google Regnearket

Cloud Function bruker **Application Default Credentials (ADC)** som automatisk autentiserer med funksjonens tjenestekonto.

1. Finn e-postadressen til prosjektets standard tjenestekonto (Compute Engine / Cloud Run service account):
   - Format: `<PROSJEKT_NUMMER>-compute@developer.gserviceaccount.com`
   - Du finner prosjektnummeret på [Cloud Console Dashboard](https://console.cloud.google.com/home/dashboard).
   - _(Eller kjør: `gcloud projects describe <PROJECT_ID> --format="value(projectNumber)"`)_
   - _Tips:_ Hvis prosjektnummeret er f.eks. `123456789`, er e-posten `123456789-compute@developer.gserviceaccount.com`.
2. Åpne Google Regnearket for TorTur i nettleseren
3. Klikk på **Del** (Share) øverst i høyre hjørne.
4. Legg til tjenestekontoen (`<PROSJEKT_NUMMER>-compute@developer.gserviceaccount.com`) med rollen **Redaktør (Editor)** og trykk **Send/Del** (fjern eventuelt hake for å sende e-postvarsel).

_(Valgfritt alternativ: Hvis du har lagt til hemmeligheten `tortur-service-account-json` i Secret Manager med innholdet fra `service-account.json`, vil koden automatisk gjenkjenne og bruke denne i stedet for standard compute-kontoen)._

### Steg 3: Secret Manager (for Google Drive-tilgang)

Disse 3 hemmelighetene må allerede eksistere i **Google Secret Manager**:

1. `tortur-drive-refresh-token`
2. `tortur-oauth-client-id`
3. `tortur-oauth-client-secret`

---

## 🚀 Deploy til Google Cloud Functions (Gen 2)

> [!IMPORTANT]
> I henhold til prosjektreglene kjøres deploy-kommandoen **manuelt av deg** i din terminal.

1. Pass på at du er logget inn i `gcloud`:
   ```bash
   gcloud config set project tortur-87147
   ```
2. Kjør deploy-skriptet:
   ```bash
   ./scripts/drive-upload-function/deploy.sh
   ```
   Eller kjør gcloud direkte:
   ```bash
   gcloud functions deploy <FUNCTION_NAME> \
     --gen2 \
     --runtime=nodejs22 \
     --region=europe-west1 \
     --source=scripts/drive-upload-function \
     --entry-point=<FUNCTION_NAME> \
     --trigger-http \
     --allow-unauthenticated \
     --memory=256MiB \
     --timeout=30s \
     --set-secrets 'REFRESH_TOKEN=tortur-drive-refresh-token:latest,CLIENT_ID=tortur-oauth-client-id:latest,CLIENT_SECRET=tortur-oauth-client-secret:latest' \
     --update-env-vars INNSJEKK_FOLDER_ID="<FOLDER_ID>",SPREADSHEET_ID="<SPREADHSEET_ID>",SHEET_BRUKERE="Brukere",SHEET_SYSTEM="SystemKonfigurasjon",SHEET_INNSJEKK="TurpostInnsjekk"
   ```

---

## 🔍 Verifisering og helsesjekk (GET)

Når funksjonen er deployet, kan du åpne funksjonens URL direkte i nettleseren eller med curl:

```bash
curl https://europe-west1-tortur-87147.cloudfunctions.net/<FUNCTION_NAME>
```

Den vil svare med helsekontroll og diagnostikk:

```json
{
  "status": "ok",
  "app": "TorTur Cloud Function API (Drive + Sheets)",
  "sheets_auth": "connected",
  "drive_auth": "connected",
  "supported_actions": [
    "upload_image (multipart/form-data)",
    "login",
    "checkin",
    "delete_checkin",
    "update_checkin",
    "getconfig"
  ]
}
```

---

## 📱 Koble TorTur Webapp (.env)

Når funksjonen er deployet og helsesjekken viser `sheets_auth: "connected"`, oppdaterer du `.env` i prosjektets rot:

```env
# Google Cloud Function for både bildeopplasting og Sheets API:
VITE_DRIVE_UPLOAD_URL=https://europe-west1-tortur-87147.cloudfunctions.net/<FUNCTION_NAME>
VITE_API_URL=https://europe-west1-tortur-87147.cloudfunctions.net/<FUNCTION_NAME>
```

Webappen vil nå sende alle backend-forespørsler (både bildeopplasting og registrering i Google Sheets) direkte til Google Cloud Function!
