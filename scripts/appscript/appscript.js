// =============================================================================
// TorTur – Google Apps Script Backend v13
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
//   Fane "Brukere":            UserID | UserName | Email | AvatarUrl | LastLogin | IsAdmin
//   Fane "SystemKonfigurasjon": Key    | Value
//   Fane "TurpostInnsjekk":    UserID | TurpostID | TimeStamp | Beskrivelse | BildeURL | CheckinID
//
// Nøkler i SystemKonfigurasjon som appen bruker:
//   AIS_CLIENT_ID          – BarentsWatch Client ID
//   AIS_CLIENT_SECRET      – BarentsWatch Client Secret
//   INNSJEKK_FOLDER_ID     – (Valgfri) Mappe-ID i Google Drive for turbilder
//   FIREBASE_DB_URL        – (Valgfri) URL til Firebase Realtime Database
//   FIREBASE_SECRET_PREFIX – (Valgfri) Hemmelig prefiks/sti i Firebase Database
// =============================================================================

var SPREADSHEET_ID = 'LIMES_INN_SPREADSHEET_ID_HER' // <-- Fyll inn ditt Spreadsheet ID
var SHEET_BRUKERE = 'Brukere'
var SHEET_SYSTEM = 'SystemKonfigurasjon'
var SHEET_INNSJEKK = 'TurpostInnsjekk'

// Kolonner i "Brukere"-fanen (1-indeksert, tilsvarer A=1, B=2 osv.)
var COL_USER_ID = 1 // A – UserID (Google sub)
var COL_USER_NAME = 2 // B – UserName
var COL_EMAIL = 3 // C – Email
var COL_AVATAR_URL = 4 // D – AvatarUrl
var COL_LAST_LOGIN = 5 // E – LastLogin (UTC ISO-streng)
var COL_IS_ADMIN = 6 // F – IsAdmin ("Y" = admin)

// Kolonner i "SystemKonfigurasjon"-fanen
var COL_KEY = 1 // A – Key
var COL_VALUE = 2 // B – Value

// Kolonner i "TurpostInnsjekk"-fanen (1-indeksert, tilsvarer A=1, B=2 osv.)
var COL_INNSJEKK_USER_ID = 1 // A – UserID (Google sub)
var COL_INNSJEKK_TURPOST_ID = 2 // B – TurpostID
var COL_INNSJEKK_TIMESTAMP = 3 // C – TimeStamp (UTC ISO-streng)
var COL_INNSJEKK_DESC = 4 // D – Beskrivelse
var COL_INNSJEKK_IMAGE_URL = 5 // E – BildeURL
var COL_INNSJEKK_CHECKIN_ID = 6 // F – CheckinID
var COL_INNSJEKK_TRACK_ID = 7 // G – TrackID

// =============================================================================
// authorizeMe – kjør denne funksjonen én gang for å autorisere scriptet
// =============================================================================
function authorizeMe() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID)
  var root = DriveApp.getRootFolder()
  Logger.log('Suksess! Skriptet er autorisert for regneark og Google Drive.')
}

// =============================================================================
// doGet – helsekontroll (apne deployment-URL i nettleser for a teste)
// =============================================================================
function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'ok',
      app: 'TorTur AppScript',
      timestamp: new Date().toISOString(),
    }),
  ).setMimeType(ContentService.MimeType.JSON)
}

// =============================================================================
// doPost – innloggings- og innsjekkingspunkt
// Forventet request body (JSON):
//   { "action": "login", "idToken": "<Google id_token>" }
//   eller
//   { "action": "checkin", "turpostId": "...", "description": "...", "image": { ... } }
//   eller
//   { "action": "delete_checkin", "turpostId": "...", "checkinId": "..." }
//   eller
//   { "action": "update_checkin_image", "turpostId": "...", "checkinId": "...", "image": { ... } }
// =============================================================================
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents)
    var action = (body.action || 'login').toString().toLowerCase()

    if (action === 'login') {
      return handleLogin(body)
    }

    if (action === 'checkin') {
      return handleCheckin(body)
    }

    if (action === 'delete_checkin') {
      return handleDeleteCheckin(body)
    }

    if (action === 'update_checkin' || action === 'update_checkin_image') {
      return handleUpdateCheckin(body)
    }

    if (action === 'upload_image' || action === 'uploadimage') {
      return handleUploadImageOnly(body)
    }

    if (action === 'delete_image' || action === 'deleteimage') {
      return handleDeleteImageOnly(body)
    }

    if (action === 'getconfig' || action === 'config') {
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID)
      var userId = body.userId
      if (!userId && body.idToken) {
        var u = validateGoogleToken(body.idToken)
        if (u) userId = u.sub
      }
      if (!userId) {
        return jsonResponse({
          success: false,
          error: 'Krever innlogging for a hente systemkonfigurasjon.',
        })
      }
      return jsonResponse({ success: true, systemConfig: getSystemConfig(ss) })
    }

    return jsonResponse({ success: false, error: 'Ukjent action: ' + action })
  } catch (err) {
    return jsonResponse({ success: false, error: 'Serverfeil: ' + err.message })
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
  var idToken = body.idToken
  if (!idToken) {
    return jsonResponse({ success: false, error: 'Mangler idToken i forespoerselen.' })
  }

  // 1. Valider token mot Googles tokeninfo-endepunkt
  var googleUser = validateGoogleToken(idToken)
  if (!googleUser) {
    return jsonResponse({
      success: false,
      error: 'Ugyldig Google-token. Proev aa logg inn paa nytt.',
    })
  }

  var email = (googleUser.email || '').toLowerCase().trim()

  // 2. Sla opp e-post i "Brukere"-fanen
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID)
  var sheet = ss.getSheetByName(SHEET_BRUKERE)
  if (!sheet) {
    return jsonResponse({
      success: false,
      error: 'Konfigurasjonsfeil: Fant ikke fanen "' + SHEET_BRUKERE + '" i regnearket.',
    })
  }

  var data = sheet.getDataRange().getValues()
  var userRowIndex = -1 // 1-indeksert radnummer
  var isAdmin = false

  // Rad 0 er overskriftsrad – start soek fra rad 1
  for (var i = 1; i < data.length; i++) {
    var rowEmail = (data[i][COL_EMAIL - 1] || '').toString().toLowerCase().trim()
    if (rowEmail === email) {
      userRowIndex = i + 1 // getRange er 1-indeksert
      isAdmin = (data[i][COL_IS_ADMIN - 1] || '').toString().trim().toUpperCase() === 'Y'
      break
    }
  }

  if (userRowIndex === -1) {
    return jsonResponse({
      success: false,
      error:
        'Brukeren <' +
        googleUser.email +
        '> er ikke whitelistet for TorTur-appen. Ta kontakt med administrator for å få tilgang.',
    })
  }

  // 3. Oppdater brukerraden
  var now = new Date().toISOString()
  sheet.getRange(userRowIndex, COL_USER_ID).setValue(googleUser.sub || '')
  sheet.getRange(userRowIndex, COL_USER_NAME).setValue(googleUser.name || '')
  sheet.getRange(userRowIndex, COL_AVATAR_URL).setValue(googleUser.picture || '')
  sheet.getRange(userRowIndex, COL_LAST_LOGIN).setValue(now)

  // 4. Hent systemkonfigurasjon (AIS-nokler osv.)
  var systemConfig = getSystemConfig(ss)

  return jsonResponse({
    success: true,
    user: {
      userId: googleUser.sub || '',
      userName: googleUser.name || '',
      email: googleUser.email || '',
      avatarUrl: googleUser.picture || '',
      lastLogin: now,
      isAdmin: isAdmin,
    },
    systemConfig: systemConfig,
  })
}

// =============================================================================
// handleCheckin
// Lagrer innsjekk pa en turpost i fanen definert av SHEET_INNSJEKK og laster opp bilde til Drive.
// Forventet request body (JSON):
//   {
//     "action": "checkin",
//     "idToken": "<Google id_token>",
//     "userId": "<Google sub / UserID>",
//     "email": "<brukerens e-post>",
//     "turpostId": "12345",
//     "description": "Fin tur i dag!",
//     "image": {
//       "base64": "<base64 encoded data>",
//       "mimeType": "image/jpeg",
//       "fileName": "innsjekk_123.jpg"
//     }
//   }
// =============================================================================
function handleCheckin(body) {
  var turpostId = body.turpostId
  if (!turpostId) {
    return jsonResponse({ success: false, error: 'Mangler turpostId for innsjekk.' })
  }

  // 1. Brukervalidering
  var userId = body.userId
  var email = (body.email || '').toLowerCase().trim()

  // Hvis idToken er oppgitt, prover vi aa validere det
  if (body.idToken) {
    var googleUser = validateGoogleToken(body.idToken)
    if (googleUser) {
      userId = googleUser.sub || userId
      email = (googleUser.email || email).toLowerCase().trim()
    }
  }

  if (!userId && !email) {
    return jsonResponse({
      success: false,
      error: 'Ugyldig eller manglende brukerinfo for innsjekking.',
    })
  }

  // 2. Apne regnearket og sjekk at brukeren er registrert / whitelistet
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID)
  var brukereSheet = ss.getSheetByName(SHEET_BRUKERE)
  if (!brukereSheet) {
    return jsonResponse({ success: false, error: 'Fant ikke fanen "' + SHEET_BRUKERE + '".' })
  }

  var brukereData = brukereSheet.getDataRange().getValues()
  var isWhitelisted = false
  var userName = ''
  var userAvatar = ''
  for (var i = 1; i < brukereData.length; i++) {
    var rowUserId = (brukereData[i][COL_USER_ID - 1] || '').toString().trim()
    var rowEmail = (brukereData[i][COL_EMAIL - 1] || '').toString().toLowerCase().trim()
    if ((userId && rowUserId === userId) || (email && rowEmail === email)) {
      isWhitelisted = true
      if (!userId) userId = rowUserId || email
      userName = (brukereData[i][COL_USER_NAME - 1] || '').toString().trim()
      userAvatar = (brukereData[i][COL_AVATAR_URL - 1] || '').toString().trim()
      break
    }
  }

  if (!isWhitelisted) {
    return jsonResponse({
      success: false,
      error: 'Brukeren er ikke registrert i brukeroversikten for TorTur.',
    })
  }

  // 3. Handter bildeopplasting til Google Drive
  var imageUrl = ''
  if (body.image && body.image.base64) {
    imageUrl = uploadCheckinImage(ss, turpostId, body.image)
  }

  var checkinId = 'c_' + new Date().getTime()
  var timestamp = new Date().toISOString()
  var description = (body.description || '').toString().trim()

  // 4. Finn eller opprett innsjekkingsfanen
  var innsjekkSheet = ss.getSheetByName(SHEET_INNSJEKK)
  if (!innsjekkSheet) {
    innsjekkSheet = ss.insertSheet(SHEET_INNSJEKK)
    var headers = []
    headers[COL_INNSJEKK_USER_ID - 1] = 'UserID'
    headers[COL_INNSJEKK_TURPOST_ID - 1] = 'TurpostID'
    headers[COL_INNSJEKK_TIMESTAMP - 1] = 'TimeStamp'
    headers[COL_INNSJEKK_DESC - 1] = 'Beskrivelse'
    headers[COL_INNSJEKK_IMAGE_URL - 1] = 'BildeURL'
    headers[COL_INNSJEKK_CHECKIN_ID - 1] = 'CheckinID'
    headers[COL_INNSJEKK_TRACK_ID - 1] = 'TrackID'
    innsjekkSheet.appendRow(headers)

    var headerRange = innsjekkSheet.getRange(1, 1, 1, 7)
    headerRange.setFontWeight('bold')
    headerRange.setBackground('#0284c7')
    headerRange.setFontColor('#ffffff')
  }

  // 5. Legg til innsjekkingsrad i regnearket
  var rowData = []
  rowData[COL_INNSJEKK_USER_ID - 1] = userId
  rowData[COL_INNSJEKK_TURPOST_ID - 1] = turpostId
  rowData[COL_INNSJEKK_TIMESTAMP - 1] = timestamp
  rowData[COL_INNSJEKK_DESC - 1] = description
  rowData[COL_INNSJEKK_IMAGE_URL - 1] = imageUrl
  rowData[COL_INNSJEKK_CHECKIN_ID - 1] = checkinId
  rowData[COL_INNSJEKK_TRACK_ID - 1] = body.trackId || ''
  innsjekkSheet.appendRow(rowData)

  // 6. Firebase Realtime Database håndteres nå direkte av webklienten via autentisert Firebase SDK.
  // Apps Script har dermed fullført lagring i Regneark og opplasting av bilde til Google Drive.

  return jsonResponse({
    success: true,
    checkin: {
      id: checkinId,
      userId: userId,
      userName: userName,
      userAvatar: userAvatar,
      turpostId: turpostId,
      timestamp: timestamp,
      description: description,
      imageUrl: imageUrl,
    },
    systemConfig: getSystemConfig(ss),
  })
}

// =============================================================================
// handleDeleteCheckin
// Sletter en innsjekking fra Google Regneark og tilhørende Google Drive-bilde,
// og synkroniserer sletting til Firebase RTDB.
// Kun eieren av innsjekkingen (UserID) har tillatelse til å slette den.
// =============================================================================
function handleDeleteCheckin(body) {
  var turpostId = body.turpostId
  var checkinId = body.checkinId
  var timestamp = body.timestamp
  var userId = body.userId

  // Autentisering / verifisering
  if (body.idToken) {
    var googleUser = validateGoogleToken(body.idToken)
    if (googleUser) {
      userId = googleUser.sub || userId
    }
  }

  if (!userId) {
    return jsonResponse({
      success: false,
      error: 'Ugyldig eller manglende brukeridentifikator for sletting.',
    })
  }

  if (!turpostId && !checkinId) {
    return jsonResponse({
      success: false,
      error: 'Mangler turpostId eller checkinId for sletting.',
    })
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID)
  var innsjekkSheet = ss.getSheetByName(SHEET_INNSJEKK)
  var deletedImageCount = 0
  var deletedFromSheet = false

  if (innsjekkSheet) {
    var data = innsjekkSheet.getDataRange().getValues()
    // Let fra bunnen for sikker rad-sletting
    for (var i = data.length - 1; i >= 1; i--) {
      var rowUserId = (data[i][COL_INNSJEKK_USER_ID - 1] || '').toString().trim()
      var rowTurpostId = (data[i][COL_INNSJEKK_TURPOST_ID - 1] || '').toString().trim()
      var rowTimestamp = (data[i][COL_INNSJEKK_TIMESTAMP - 1] || '').toString().trim()
      var rowImageUrl = (data[i][COL_INNSJEKK_IMAGE_URL - 1] || '').toString().trim()
      var rowCheckinId =
        data[i].length >= COL_INNSJEKK_CHECKIN_ID
          ? (data[i][COL_INNSJEKK_CHECKIN_ID - 1] || '').toString().trim()
          : ''

      // Krev at raden tilhører innlogget bruker!
      if (rowUserId !== userId) {
        continue
      }

      var isMatch = false
      if (checkinId && rowCheckinId && rowCheckinId === checkinId) {
        isMatch = true
      } else if (turpostId && String(turpostId) === rowTurpostId) {
        if (checkinId && rowCheckinId && rowCheckinId === checkinId) {
          isMatch = true
        } else if (timestamp && rowTimestamp === timestamp) {
          isMatch = true
        } else if (!rowCheckinId && !checkinId && timestamp && rowTimestamp === timestamp) {
          isMatch = true
        }
      }

      if (isMatch) {
        // Slett tilhørende Drive-bilde hvis det finnes
        var fileId = extractDriveFileId(rowImageUrl)
        if (fileId) {
          deleteDriveFile(fileId)
          deletedImageCount++
        }
        innsjekkSheet.deleteRow(i + 1)
        deletedFromSheet = true
        break
      }
    }
  }

  // Sletting i Firebase Realtime Database håndteres nå direkte av webklienten via autentisert Firebase SDK.
  // Apps Script har dermed fullført sletting fra Regneark og Google Drive.

  return jsonResponse({
    success: true,
    checkinId: checkinId,
    deletedFromSheet: deletedFromSheet,
    deletedImages: deletedImageCount,
  })
}

// =============================================================================
// handleUpdateCheckin
// Oppdaterer turbeskrivelse og/eller turbildet for en innsjekking i Google Regneark og Firebase,
// samt sletter gammelt bilde fra Google Drive dersom det erstattes eller fjernes.
// Kun eieren av innsjekkingen (UserID) har tillatelse til å oppdatere den.
// =============================================================================
function handleUpdateCheckin(body) {
  var turpostId = body.turpostId
  var checkinId = body.checkinId
  var timestamp = body.timestamp
  var userId = body.userId

  // Autentisering / verifisering
  if (body.idToken) {
    var googleUser = validateGoogleToken(body.idToken)
    if (googleUser) {
      userId = googleUser.sub || userId
    }
  }

  if (!userId) {
    return jsonResponse({
      success: false,
      error: 'Ugyldig eller manglende brukeridentifikator for oppdatering.',
    })
  }

  if (!turpostId && !checkinId) {
    return jsonResponse({
      success: false,
      error: 'Mangler turpostId eller checkinId for oppdatering.',
    })
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID)
  var innsjekkSheet = ss.getSheetByName(SHEET_INNSJEKK)
  var updatedImageUrl = undefined
  var foundRowIndex = -1
  var oldImageUrl = ''

  if (innsjekkSheet) {
    var data = innsjekkSheet.getDataRange().getValues()
    for (var i = 1; i < data.length; i++) {
      var rowUserId = (data[i][COL_INNSJEKK_USER_ID - 1] || '').toString().trim()
      var rowTurpostId = (data[i][COL_INNSJEKK_TURPOST_ID - 1] || '').toString().trim()
      var rowTimestamp = (data[i][COL_INNSJEKK_TIMESTAMP - 1] || '').toString().trim()
      var rowCheckinId =
        data[i].length >= COL_INNSJEKK_CHECKIN_ID
          ? (data[i][COL_INNSJEKK_CHECKIN_ID - 1] || '').toString().trim()
          : ''

      if (rowUserId !== userId) {
        continue
      }

      var isMatch = false
      if (checkinId && rowCheckinId && rowCheckinId === checkinId) {
        isMatch = true
      } else if (turpostId && String(turpostId) === rowTurpostId) {
        if (checkinId && rowCheckinId && rowCheckinId === checkinId) {
          isMatch = true
        } else if (timestamp && rowTimestamp === timestamp) {
          isMatch = true
        }
      }

      if (isMatch) {
        foundRowIndex = i + 1
        oldImageUrl = (data[i][COL_INNSJEKK_IMAGE_URL - 1] || '').toString().trim()
        break
      }
    }
  }

  // 1. Beskrivelse
  var updatedDescription =
    body.description !== undefined ? body.description.toString().trim() : undefined
  if (foundRowIndex > 0 && innsjekkSheet && updatedDescription !== undefined) {
    innsjekkSheet.getRange(foundRowIndex, COL_INNSJEKK_DESC).setValue(updatedDescription)
  }

  // 2. Bildehåndtering
  if (body.image && body.image.base64) {
    if (oldImageUrl) {
      var oldFileId = extractDriveFileId(oldImageUrl)
      if (oldFileId) deleteDriveFile(oldFileId)
    }
    updatedImageUrl = uploadCheckinImage(ss, turpostId, body.image)
    if (foundRowIndex > 0 && innsjekkSheet) {
      innsjekkSheet.getRange(foundRowIndex, COL_INNSJEKK_IMAGE_URL).setValue(updatedImageUrl)
    }
  } else if (body.removeImage === true) {
    if (oldImageUrl) {
      var oldFileId = extractDriveFileId(oldImageUrl)
      if (oldFileId) deleteDriveFile(oldFileId)
    }
    updatedImageUrl = ''
    if (foundRowIndex > 0 && innsjekkSheet) {
      innsjekkSheet.getRange(foundRowIndex, COL_INNSJEKK_IMAGE_URL).setValue('')
    }
  }

  // 3. TrackID
  if (foundRowIndex > 0 && innsjekkSheet && body.trackId !== undefined) {
    innsjekkSheet.getRange(foundRowIndex, COL_INNSJEKK_TRACK_ID).setValue(body.trackId ? body.trackId.toString().trim() : '')
  }

  // Oppdatering i Firebase Realtime Database håndteres nå direkte av webklienten via autentisert Firebase SDK.
  // Apps Script har dermed fullført oppdatering i Regneark og Google Drive.

  return jsonResponse({
    success: true,
    checkinId: checkinId,
    description: updatedDescription,
    imageUrl: updatedImageUrl !== undefined ? updatedImageUrl : oldImageUrl,
    trackId: body.trackId !== undefined ? body.trackId : undefined,
  })
}

// Bakoverkompatibilitet
function handleUpdateCheckinImage(body) {
  return handleUpdateCheckin(body)
}

// =============================================================================
// uploadCheckinImage
// Hjelpefunksjon for å laste opp et bilde til riktig turpost-undermappe i Drive
// =============================================================================
function uploadCheckinImage(ss, turpostId, imageObj) {
  try {
    var systemConfig = getSystemConfig(ss)
    var baseFolder

    if (systemConfig.INNSJEKK_FOLDER_ID && systemConfig.INNSJEKK_FOLDER_ID.trim() !== '') {
      baseFolder = DriveApp.getFolderById(systemConfig.INNSJEKK_FOLDER_ID.trim())
    } else {
      var ssFile = DriveApp.getFileById(SPREADSHEET_ID)
      var parents = ssFile.getParents()
      baseFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder()
    }

    var subfolderName = String(turpostId || 'ukjent')
    var folderIterator = baseFolder.getFoldersByName(subfolderName)
    var targetFolder = folderIterator.hasNext()
      ? folderIterator.next()
      : baseFolder.createFolder(subfolderName)

    targetFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)

    var base64Data = imageObj.base64
    if (base64Data.indexOf(',') > -1) {
      base64Data = base64Data.split(',')[1]
    }

    var mimeType = imageObj.mimeType || 'image/jpeg'
    var ext =
      mimeType.indexOf('png') > -1 ? '.png' : mimeType.indexOf('webp') > -1 ? '.webp' : '.jpg'
    var fileName = imageObj.fileName || 'innsjekk_' + Date.now() + ext

    var decodedBytes = Utilities.base64Decode(base64Data)
    var blob = Utilities.newBlob(decodedBytes, mimeType, fileName)
    var driveFile = targetFolder.createFile(blob)

    driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)
    return 'https://lh3.googleusercontent.com/d/' + driveFile.getId()
  } catch (driveErr) {
    Logger.log('Feil ved bildeopplasting til Drive: ' + driveErr.message)
    return ''
  }
}

// =============================================================================
// extractDriveFileId
// Henter ut fil-ID fra en Google Drive / Google UserContent URL
// =============================================================================
function extractDriveFileId(url) {
  if (!url || typeof url !== 'string') return null
  var m = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
  if (m && m[1]) return m[1]
  var m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (m2 && m2[1]) return m2[1]
  return null
}

// =============================================================================
// deleteDriveFile
// Sletter (legger i papirkurven) en fil i Google Drive
// =============================================================================
function deleteDriveFile(fileId) {
  if (!fileId) return
  try {
    var file = DriveApp.getFileById(fileId)
    if (file) {
      file.setTrashed(true)
    }
  } catch (err) {
    Logger.log('Kunne ikke slette Drive-fil (' + fileId + '): ' + err.message)
  }
}

// =============================================================================
// validateGoogleToken
// Verifiserer id_token via Googles tokeninfo-endepunkt.
// Returnerer payload-objektet ved suksess, null ved feil.
// =============================================================================
function validateGoogleToken(idToken) {
  try {
    var url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken)
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true })

    if (response.getResponseCode() !== 200) {
      Logger.log('Token-validering: HTTP ' + response.getResponseCode())
      return null
    }

    var payload = JSON.parse(response.getContentText())

    // Krev verifisert e-postadresse
    if (!payload.email || (payload.email_verified !== true && payload.email_verified !== 'true')) {
      Logger.log('Token-validering: e-post ikke verifisert')
      return null
    }

    return payload
  } catch (err) {
    Logger.log('Token-validering kastet feil: ' + err.message)
    return null
  }
}

// =============================================================================
// getSystemConfig
// Leser alle Key/Value-par fra "SystemKonfigurasjon"-fanen.
// Returnerer et objekt der keys er nokkelnavnene.
// =============================================================================
function getSystemConfig(ss) {
  var config = {}
  try {
    var sheet = ss.getSheetByName(SHEET_SYSTEM)
    if (!sheet) {
      Logger.log('Fant ikke fanen "' + SHEET_SYSTEM + '"')
      return config
    }
    var data = sheet.getDataRange().getValues()
    // Rad 0 er overskriftsrad
    for (var i = 1; i < data.length; i++) {
      var key = (data[i][COL_KEY - 1] || '').toString().trim()
      var value = (data[i][COL_VALUE - 1] || '').toString().trim()
      if (key) {
        config[key] = value
      }
    }
  } catch (err) {
    Logger.log('Feil ved lesing av systemkonfigurasjon: ' + err.message)
  }
  return config
}

// =============================================================================
// handleUploadImageOnly
// Enkelt endepunkt for PHP-backend til å laste opp bilde til brukerens Google Drive
// uten Service Account 0-byte kvoteproblem.
// =============================================================================
function handleUploadImageOnly(body) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID)
  var turpostId = (body.turpostId || 'ukjent').toString().trim()
  if (!body.image || !body.image.base64) {
    return jsonResponse({ success: false, error: 'Mangler bildedata (image.base64).' })
  }
  var imageUrl = uploadCheckinImage(ss, turpostId, body.image)
  if (!imageUrl) {
    return jsonResponse({ success: false, error: 'Kunne ikke laste opp bilde til Google Drive.' })
  }
  return jsonResponse({ success: true, imageUrl: imageUrl })
}

function handleDeleteImageOnly(body) {
  var imageUrl = body.imageUrl || ''
  var fileId = body.fileId || extractDriveFileId(imageUrl)
  if (fileId) {
    deleteDriveFile(fileId)
    return jsonResponse({ success: true })
  }
  return jsonResponse({ success: false, error: 'Ingen gyldig fileId eller imageUrl funnet.' })
}

// =============================================================================
// jsonResponse – hjelper for konsistent JSON-respons
// =============================================================================
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  )
}
