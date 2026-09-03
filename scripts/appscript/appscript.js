// =============================================================================
// TorTur – Google Apps Script Backend
// =============================================================================
// Instruksjoner:
//  1. Gå til Google Regneark → Extensions → Apps Script
//  2. Lim inn dette scriptet
//  3. Fyll inn spreadsheetId i variabelen SPREADSHEET_ID nedenfor
//  4. Kjør funksjonen authorizeMe() én gang for å gi scriptet rettigheter
//  5. Publiser som Web App:
//       Execute as: Me
//       Who has access: Anyone
//  6. Kopier deployment-URL til .env som VITE_APPSCRIPT_URL
// =============================================================================
//
// Forventet struktur i Google Regneark:
//   Fane "Brukere":            UserID | UserName | Email | AvatarUrl | LastLogin
//   Fane "SystemKonfigurasjon": Key    | Value
//
// Nøkler i SystemKonfigurasjon som appen bruker:
//   AIS_CLIENT_ID     – BarentsWatch Client ID
//   AIS_CLIENT_SECRET – BarentsWatch Client Secret
// =============================================================================

var SPREADSHEET_ID = 'LIMES_INN_SPREADSHEET_ID_HER'; // <-- Fyll inn ditt Spreadsheet ID
var SHEET_BRUKERE  = 'Brukere';
var SHEET_SYSTEM   = 'SystemKonfigurasjon';

// Kolonner i "Brukere"-fanen (1-indeksert, tilsvarer A=1, B=2 osv.)
var COL_USER_ID    = 1; // A – UserID (Google sub)
var COL_USER_NAME  = 2; // B – UserName
var COL_EMAIL      = 3; // C – Email
var COL_AVATAR_URL = 4; // D – AvatarUrl
var COL_LAST_LOGIN = 5; // E – LastLogin (UTC ISO-streng)

// Kolonner i "SystemKonfigurasjon"-fanen
var COL_KEY   = 1; // A – Key
var COL_VALUE = 2; // B – Value

// =============================================================================
// authorizeMe – kjør denne funksjonen én gang for å autorisere scriptet
// =============================================================================
function authorizeMe() {
  Logger.log('Suksess! Skriptet er autorisert og kjorer fint.');
}

// =============================================================================
// doGet – helsekontroll (apne deployment-URL i nettleser for a teste)
// =============================================================================
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'ok',
      app: 'TorTur AppScript',
      timestamp: new Date().toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// =============================================================================
// doPost – innloggingspunkt
// Forventet request body (JSON):
//   { "action": "login", "idToken": "<Google id_token>" }
// =============================================================================
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = (body.action || 'login').toString().toLowerCase();

    if (action === 'login') {
      return handleLogin(body);
    }

    return jsonResponse({ success: false, error: 'Ukjent action: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: 'Serverfeil: ' + err.message });
  }
}

// =============================================================================
// handleLogin
// 1. Validerer Google id_token
// 2. Sjekker whitelist (Email-felt i "Brukere"-fanen)
// 3. Oppdaterer brukerraden med oppdatert info og LastLogin-tidsstempel
// 4. Returnerer brukerdata + systemkonfigurasjon (inkl. AIS-nokler)
// =============================================================================
function handleLogin(body) {
  var idToken = body.idToken;
  if (!idToken) {
    return jsonResponse({ success: false, error: 'Mangler idToken i forespoerselen.' });
  }

  // 1. Valider token mot Googles tokeninfo-endepunkt
  var googleUser = validateGoogleToken(idToken);
  if (!googleUser) {
    return jsonResponse({
      success: false,
      error: 'Ugyldig Google-token. Proev aa logg inn paa nytt.'
    });
  }

  var email = (googleUser.email || '').toLowerCase().trim();

  // 2. Sla opp e-post i "Brukere"-fanen
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_BRUKERE);
  if (!sheet) {
    return jsonResponse({
      success: false,
      error: 'Konfigurasjonsfeil: Fant ikke fanen "' + SHEET_BRUKERE + '" i regnearket.'
    });
  }

  var data = sheet.getDataRange().getValues();
  var userRowIndex = -1; // 1-indeksert radnummer

  // Rad 0 er overskriftsrad – start soek fra rad 1
  for (var i = 1; i < data.length; i++) {
    var rowEmail = (data[i][COL_EMAIL - 1] || '').toString().toLowerCase().trim();
    if (rowEmail === email) {
      userRowIndex = i + 1; // getRange er 1-indeksert
      break;
    }
  }

  if (userRowIndex === -1) {
    return jsonResponse({
      success: false,
      error: 'Brukeren <' + googleUser.email + '> er ikke whitelistet for TorTur-appen. Ta kontakt med administrator for aa faa tilgang.'
    });
  }

  // 3. Oppdater brukerraden
  var now = new Date().toISOString();
  sheet.getRange(userRowIndex, COL_USER_ID).setValue(googleUser.sub || '');
  sheet.getRange(userRowIndex, COL_USER_NAME).setValue(googleUser.name || '');
  sheet.getRange(userRowIndex, COL_AVATAR_URL).setValue(googleUser.picture || '');
  sheet.getRange(userRowIndex, COL_LAST_LOGIN).setValue(now);

  // 4. Hent systemkonfigurasjon (AIS-nokler osv.)
  var systemConfig = getSystemConfig(ss);

  return jsonResponse({
    success: true,
    user: {
      userId:    googleUser.sub     || '',
      userName:  googleUser.name    || '',
      email:     googleUser.email   || '',
      avatarUrl: googleUser.picture || '',
      lastLogin: now
    },
    systemConfig: systemConfig
  });
}

// =============================================================================
// validateGoogleToken
// Verifiserer id_token via Googles tokeninfo-endepunkt.
// Returnerer payload-objektet ved suksess, null ved feil.
// =============================================================================
function validateGoogleToken(idToken) {
  try {
    var url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });

    if (response.getResponseCode() !== 200) {
      Logger.log('Token-validering: HTTP ' + response.getResponseCode());
      return null;
    }

    var payload = JSON.parse(response.getContentText());

    // Krev verifisert e-postadresse
    if (!payload.email || (payload.email_verified !== true && payload.email_verified !== 'true')) {
      Logger.log('Token-validering: e-post ikke verifisert');
      return null;
    }

    return payload;
  } catch (err) {
    Logger.log('Token-validering kastet feil: ' + err.message);
    return null;
  }
}

// =============================================================================
// getSystemConfig
// Leser alle Key/Value-par fra "SystemKonfigurasjon"-fanen.
// Returnerer et objekt der keys er nokkelnavnene.
// =============================================================================
function getSystemConfig(ss) {
  var config = {};
  try {
    var sheet = ss.getSheetByName(SHEET_SYSTEM);
    if (!sheet) {
      Logger.log('Fant ikke fanen "' + SHEET_SYSTEM + '"');
      return config;
    }
    var data = sheet.getDataRange().getValues();
    // Rad 0 er overskriftsrad
    for (var i = 1; i < data.length; i++) {
      var key   = (data[i][COL_KEY - 1]   || '').toString().trim();
      var value = (data[i][COL_VALUE - 1] || '').toString().trim();
      if (key) {
        config[key] = value;
      }
    }
  } catch (err) {
    Logger.log('Feil ved lesing av systemkonfigurasjon: ' + err.message);
  }
  return config;
}

// =============================================================================
// jsonResponse – hjelper for konsistent JSON-respons
// =============================================================================
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
