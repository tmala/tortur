import { google } from 'googleapis'
import { uploadImageToDrive, deleteImageFromDrive } from './driveService.js'
import { isValidUserId, cellToString } from './userId.js'
export { isValidUserId, cellToString }

/**
 * Oppretter en Google Sheets v4 API-klient
 * @param {Object} params
 * @param {any} params.authClient
 * @returns {import('googleapis').sheets_v4.Sheets}
 */
export function getSheetsClient(authClient) {
  return google.sheets({ version: 'v4', auth: authClient })
}

/**
 * Validerer et Google ID-token og returnerer brukerpayload hvis gyldig
 * @param {Object} params
 * @param {string} params.idToken
 * @param {import('google-auth-library').OAuth2Client} params.authVerifier
 * @param {string} [params.clientId]
 * @returns {Promise<import('google-auth-library').TokenPayload | null>}
 */
export async function verifyGoogleUser({ idToken, authVerifier, clientId }) {
  if (!idToken || typeof idToken !== 'string') return null

  try {
    const ticket = await authVerifier.verifyIdToken({
      idToken,
      audience: clientId || undefined
    })
    const payload = ticket.getPayload()
    if (!payload || !payload.email) return null

    // Krev at e-post er verifisert av Google
    const isVerified = payload.email_verified === true || String(payload.email_verified) === 'true'
    if (!isVerified) return null

    return payload
  } catch (err) {
    console.warn('[sheetsService] ID-token verifisering feilet:', err.message)
    return null
  }
}

/**
 * Leser systemkonfigurasjon fra fanen SystemKonfigurasjon
 * @param {import('googleapis').sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 * @param {string} sheetSystem
 * @returns {Promise<Record<string, string>>}
 */
export async function fetchSystemConfig(sheets, spreadsheetId, sheetSystem) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetSystem}!A:B`
    })

    const rows = res.data.values || []
    const config = {}

    // Rad 0 er overskrift, les fra rad 1
    for (let i = 1; i < rows.length; i++) {
      const key = String(rows[i][0] || '').trim()
      const val = String(rows[i][1] || '').trim()
      if (key) {
        config[key] = val
      }
    }

    return config
  } catch (err) {
    console.warn('[sheetsService] Kunne ikke hente SystemKonfigurasjon:', err.message)
    return {}
  }
}

/**
 * Håndterer innlogging: validerer ID-token, sjekker whitelist i 'Brukere', oppdaterer brukerrad
 */
export async function handleLogin({
  body,
  sheets,
  spreadsheetId,
  sheetBrukere,
  sheetSystem,
  authVerifier,
  clientId
}) {
  const idToken = body.idToken || ''
  if (!idToken) {
    return { success: false, error: 'Mangler idToken i forespørselen.' }
  }

  const googleUser = await verifyGoogleUser({ idToken, authVerifier, clientId })
  if (!googleUser) {
    return {
      success: false,
      error: 'Ugyldig Google-token. Prøv å logge inn på nytt.'
    }
  }

  const email = String(googleUser.email || '').toLowerCase().trim()

  // Les "Brukere"-fanen
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetBrukere}!A:F`
  })
  const rows = res.data.values || []

  let userRowIndex = -1 // 1-indeksert radnummer i regneark
  let isAdmin = false

  // Rad 0 er overskrift
  for (let i = 1; i < rows.length; i++) {
    const rowEmail = String(rows[i][2] || '').toLowerCase().trim() // Kolonne C (indeks 2)
    if (rowEmail === email) {
      userRowIndex = i + 1
      isAdmin = String(rows[i][5] || '').toUpperCase().trim() === 'Y' // Kolonne F (indeks 5)
      break
    }
  }

  if (userRowIndex === -1) {
    return {
      success: false,
      error: `Brukeren <${googleUser.email}> er ikke whitelistet for TorTur-appen. Ta kontakt med administrator for å få tilgang.`
    }
  }

  // Oppdater brukerraden (UserID, UserName, Email, AvatarUrl, LastLogin)
  const now = new Date().toISOString()
  const sub = String(googleUser.sub || '').trim()
  const name = String(googleUser.name || '').trim()
  const picture = String(googleUser.picture || '').trim()

  if (!isValidUserId(sub)) {
    return {
      success: false,
      error: 'Ugyldig bruker-ID i Google-token (forventet kun sifre).'
    }
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetBrukere}!A${userRowIndex}:E${userRowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[sub, name, googleUser.email, picture, now]]
    }
  })

  const systemConfig = await fetchSystemConfig(sheets, spreadsheetId, sheetSystem)

  return {
    success: true,
    user: {
      userId: sub,
      userName: name,
      email: googleUser.email,
      avatarUrl: picture,
      lastLogin: now,
      isAdmin
    },
    systemConfig
  }
}

/**
 * Håndterer innsjekking: verifiserer bruker, laster evt. opp bilde, legger til rad i 'TurpostInnsjekk'
 */
export async function handleCheckin({
  body,
  sheets,
  spreadsheetId,
  sheetBrukere,
  sheetSystem,
  sheetInnsjekk,
  authVerifier,
  clientId,
  driveAuthClient
}) {
  const turpostId = String(body.turpostId || '').trim()
  if (!turpostId) {
    return { success: false, error: 'Mangler turpostId for innsjekk.' }
  }

  let userId = String(body.userId || '').trim()
  let email = String(body.email || '').toLowerCase().trim()

  if (body.idToken) {
    const googleUser = await verifyGoogleUser({ idToken: body.idToken, authVerifier, clientId })
    if (googleUser) {
      userId = String(googleUser.sub || userId)
      email = String(googleUser.email || email).toLowerCase().trim()
    }
  }

  if (!userId && !email) {
    return {
      success: false,
      error: 'Ugyldig eller manglende brukerinfo for innsjekking.'
    }
  }

  // Sjekk at brukeren er registrert i "Brukere"
  const userRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetBrukere}!A:E`
  })
  const userRows = userRes.data.values || []
  let isWhitelisted = false
  let userName = ''
  let userAvatar = ''

  for (let i = 1; i < userRows.length; i++) {
    const rowUserId = cellToString(userRows[i][0])
    const rowEmail = String(userRows[i][2] || '').toLowerCase().trim()
    if ((userId && rowUserId === userId) || (email && rowEmail === email)) {
      isWhitelisted = true
      if (!userId && isValidUserId(rowUserId)) userId = rowUserId
      userName = String(userRows[i][1] || '').trim()
      userAvatar = String(userRows[i][3] || '').trim()
      break
    }
  }

  if (!isWhitelisted) {
    return {
      success: false,
      error: 'Brukeren er ikke registrert i brukeroversikten for TorTur.'
    }
  }

  if (!isValidUserId(userId)) {
    return {
      success: false,
      error: 'Ugyldig eller manglende numerisk bruker-ID for innsjekking.'
    }
  }

  const systemConfig = await fetchSystemConfig(sheets, spreadsheetId, sheetSystem)

  // Håndter bilde
  let imageUrl = ''
  if (body.imageUrl) {
    imageUrl = String(body.imageUrl).trim()
  } else if (body.image && body.image.base64) {
    let base64Data = String(body.image.base64)
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1]
    }
    const fileBuffer = Buffer.from(base64Data, 'base64')
    const mimeType = body.image.mimeType || 'image/jpeg'
    const fileName = body.image.fileName || ''

    const uploadRes = await uploadImageToDrive({
      authClient: driveAuthClient,
      turpostId,
      fileBuffer,
      mimeType,
      fileName
    })
    imageUrl = uploadRes.imageUrl || ''
  }

  const checkinId = 'c_' + Date.now()
  const timestamp = new Date().toISOString()
  const description = String(body.description || '').trim()
  const trackId = String(body.trackId || '').trim()

  // Legg til innsjekkingsrad i TurpostInnsjekk:
  // A: UserID | B: TurpostID | C: TimeStamp | D: Beskrivelse | E: BildeURL | F: CheckinID | G: TrackID
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetInnsjekk}!A1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[userId, turpostId, timestamp, description, imageUrl, checkinId, trackId]]
    }
  })

  return {
    success: true,
    checkin: {
      id: checkinId,
      userId,
      userName,
      userAvatar,
      turpostId,
      timestamp,
      description,
      imageUrl,
      trackId
    },
    systemConfig
  }
}

/**
 * Henter numerisk sheetId for en fane basert på navnet
 */
async function getNumericSheetId(sheets, spreadsheetId, sheetTitle) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title))'
  })
  const sheetList = meta.data.sheets || []
  for (const s of sheetList) {
    if (s.properties?.title === sheetTitle) {
      return s.properties.sheetId
    }
  }
  return null
}

/**
 * Håndterer sletting av innsjekking i 'TurpostInnsjekk' og tilhørende bilde i Drive
 */
export async function handleDeleteCheckin({
  body,
  sheets,
  spreadsheetId,
  sheetInnsjekk,
  authVerifier,
  clientId,
  driveAuthClient
}) {
  const turpostId = String(body.turpostId || '')
  const checkinId = String(body.checkinId || '')
  const timestamp = String(body.timestamp || '')
  let userId = String(body.userId || '')

  if (body.idToken) {
    const googleUser = await verifyGoogleUser({ idToken: body.idToken, authVerifier, clientId })
    if (googleUser) {
      userId = String(googleUser.sub || userId)
    }
  }

  if (!isValidUserId(userId)) {
    return {
      success: false,
      error: 'Ugyldig eller manglende brukeridentifikator for sletting (forventet kun sifre).'
    }
  }

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetInnsjekk}!A:F`
  })
  const rows = res.data.values || []
  const numericSheetId = await getNumericSheetId(sheets, spreadsheetId, sheetInnsjekk)

  let deletedFromSheet = false
  let deletedImages = 0

  if (numericSheetId !== null && rows.length > 1) {
    // Søk fra bunnen
    for (let i = rows.length - 1; i >= 1; i--) {
      const rowUserId = cellToString(rows[i][0])
      const rowTurpostId = String(rows[i][1] || '').trim()
      const rowTimestamp = String(rows[i][2] || '').trim()
      const rowImageUrl = String(rows[i][4] || '').trim()
      const rowCheckinId = String(rows[i][5] || '').trim()

      if (rowUserId !== userId) {
        continue
      }

      let isMatch = false
      if (checkinId && rowCheckinId === checkinId) {
        isMatch = true
      } else if (turpostId && rowTurpostId === turpostId) {
        if (checkinId && rowCheckinId === checkinId) {
          isMatch = true
        } else if (timestamp && rowTimestamp === timestamp) {
          isMatch = true
        }
      }

      if (isMatch) {
        if (rowImageUrl) {
          const ok = await deleteImageFromDrive({ authClient: driveAuthClient, imageUrl: rowImageUrl })
          if (ok) deletedImages++
        }

        // Slett rad i Google Sheets (0-indeksert)
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                deleteDimension: {
                  range: {
                    sheetId: numericSheetId,
                    dimension: 'ROWS',
                    startIndex: i,
                    endIndex: i + 1
                  }
                }
              }
            ]
          }
        })
        deletedFromSheet = true
        break
      }
    }
  }

  return {
    success: true,
    checkinId,
    deletedFromSheet,
    deletedImages
  }
}

/**
 * Håndterer oppdatering av innsjekking (beskrivelse, bilde, spor)
 */
export async function handleUpdateCheckin({
  body,
  sheets,
  spreadsheetId,
  sheetInnsjekk,
  authVerifier,
  clientId,
  driveAuthClient
}) {
  const turpostId = String(body.turpostId || '')
  const checkinId = String(body.checkinId || '')
  const timestamp = String(body.timestamp || '')
  let userId = String(body.userId || '')

  if (body.idToken) {
    const googleUser = await verifyGoogleUser({ idToken: body.idToken, authVerifier, clientId })
    if (googleUser) {
      userId = String(googleUser.sub || userId)
    }
  }

  if (!isValidUserId(userId)) {
    return {
      success: false,
      error: 'Ugyldig eller manglende brukeridentifikator for oppdatering (forventet kun sifre).'
    }
  }

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetInnsjekk}!A:G`
  })
  const rows = res.data.values || []
  let foundRowIndex = -1 // 1-indeksert
  let oldImageUrl = ''

  for (let i = 1; i < rows.length; i++) {
    const rowUserId = cellToString(rows[i][0])
    const rowTurpostId = String(rows[i][1] || '').trim()
    const rowTimestamp = String(rows[i][2] || '').trim()
    const rowImageUrl = String(rows[i][4] || '').trim()
    const rowCheckinId = String(rows[i][5] || '').trim()

    if (rowUserId !== userId) {
      continue
    }

    let isMatch = false
    if (checkinId && rowCheckinId === checkinId) {
      isMatch = true
    } else if (turpostId && rowTurpostId === turpostId) {
      if (checkinId && rowCheckinId === checkinId) {
        isMatch = true
      } else if (timestamp && rowTimestamp === timestamp) {
        isMatch = true
      }
    }

    if (isMatch) {
      foundRowIndex = i + 1
      oldImageUrl = rowImageUrl
      break
    }
  }

  if (foundRowIndex === -1) {
    return {
      success: false,
      error: 'Fant ikke innsjekkingen som skulle oppdateres.'
    }
  }

  const updatedDescription = body.description !== undefined ? String(body.description).trim() : null
  let updatedImageUrl = null

  if (updatedDescription !== null) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetInnsjekk}!D${foundRowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[updatedDescription]] }
    })
  }

  if (body.imageUrl) {
    if (oldImageUrl && oldImageUrl !== body.imageUrl) {
      await deleteImageFromDrive({ authClient: driveAuthClient, imageUrl: oldImageUrl })
    }
    updatedImageUrl = String(body.imageUrl).trim()
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetInnsjekk}!E${foundRowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[updatedImageUrl]] }
    })
  } else if (body.image && body.image.base64) {
    if (oldImageUrl) {
      await deleteImageFromDrive({ authClient: driveAuthClient, imageUrl: oldImageUrl })
    }
    let base64Data = String(body.image.base64)
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1]
    }
    const fileBuffer = Buffer.from(base64Data, 'base64')
    const mimeType = body.image.mimeType || 'image/jpeg'
    const fileName = body.image.fileName || ''

    const uploadRes = await uploadImageToDrive({
      authClient: driveAuthClient,
      turpostId,
      fileBuffer,
      mimeType,
      fileName
    })
    updatedImageUrl = uploadRes.imageUrl || ''

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetInnsjekk}!E${foundRowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[updatedImageUrl]] }
    })
  } else if (body.removeImage) {
    if (oldImageUrl) {
      await deleteImageFromDrive({ authClient: driveAuthClient, imageUrl: oldImageUrl })
    }
    updatedImageUrl = ''
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetInnsjekk}!E${foundRowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [['']] }
    })
  }

  let updatedTrackId = null
  if ('trackId' in body) {
    updatedTrackId = String(body.trackId ?? '').trim()
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetInnsjekk}!G${foundRowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[updatedTrackId]] }
    })
  }

  const resp = {
    success: true,
    checkinId,
    description: updatedDescription,
    imageUrl: updatedImageUrl !== null ? updatedImageUrl : oldImageUrl
  }
  if (updatedTrackId !== null) {
    resp.trackId = updatedTrackId
  }

  return resp
}

/**
 * Håndterer henting av konfigurasjon (for innloggede brukere)
 */
export async function handleGetConfig({
  body,
  sheets,
  spreadsheetId,
  sheetSystem,
  authVerifier,
  clientId
}) {
  let userId = String(body.userId || '')
  if (!userId && body.idToken) {
    const googleUser = await verifyGoogleUser({ idToken: body.idToken, authVerifier, clientId })
    if (googleUser) {
      userId = String(googleUser.sub || '')
    }
  }

  if (!isValidUserId(userId)) {
    return {
      success: false,
      error: 'Krever innlogging med gyldig numerisk bruker-ID for å hente systemkonfigurasjon.'
    }
  }

  const systemConfig = await fetchSystemConfig(sheets, spreadsheetId, sheetSystem)
  return { success: true, systemConfig }
}
