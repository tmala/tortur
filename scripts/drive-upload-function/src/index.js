import busboy from 'busboy'
import { OAuth2Client } from 'google-auth-library'
import { getDriveAuthClient, getSheetsAuthClient } from './auth.js'
import { uploadImageToDrive } from './driveService.js'
import {
  getSheetsClient,
  handleLogin,
  handleCheckin,
  handleDeleteCheckin,
  handleUpdateCheckin,
  handleGetConfig,
  isUserAuthorizedForUpload,
} from './sheetsService.js'

const authVerifier = new OAuth2Client()

/**
 * Setter CORS-headere basert på innkommende Origin
 */
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || ''
  const isAllowedOrigin =
    !origin ||
    origin === 'null' ||
    origin === 'https://trillebar.no' ||
    origin === 'http://trillebar.no' ||
    /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)

  if (isAllowedOrigin) {
    res.set('Access-Control-Allow-Origin', origin === 'null' || !origin ? '*' : origin)
  } else {
    res.set('Access-Control-Allow-Origin', 'https://trillebar.no')
  }

  res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
  res.set('Access-Control-Max-Age', '86400')
}

/**
 * Normaliserer og renser filnavn til standard UTF-8 (NFC)
 * @param {string} str
 * @returns {string}
 */
function cleanFilename(str) {
  if (!str) return ''
  return str
    .normalize('NFC')
    .replace(/[\/\\]/g, '_')
    .trim()
}

/**
 * Parser multipart/form-data fra en HTTP request
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<{ fields: Record<string, string>, file: { buffer: Buffer, filename: string, mimeType: string } | null }>}
 */
function parseMultipartRequest(req) {
  return new Promise((resolve, reject) => {
    const bb = busboy({
      headers: req.headers,
      defParamCharset: 'utf8',
    })
    const fields = {}
    let fileData = null
    const fileChunks = []

    bb.on('file', (name, fileStream, info) => {
      const { filename, mimeType } = info
      const safeFilename = cleanFilename(filename)
      fileStream.on('data', (chunk) => {
        fileChunks.push(chunk)
      })
      fileStream.on('end', () => {
        fileData = {
          buffer: Buffer.concat(fileChunks),
          filename: safeFilename,
          mimeType,
        }
      })
    })

    bb.on('field', (name, val) => {
      fields[name] = typeof val === 'string' ? val.normalize('NFC') : val
    })

    bb.on('close', () => {
      resolve({ fields, file: fileData })
    })

    bb.on('error', (err) => {
      reject(err)
    })

    if (req.rawBody) {
      bb.end(req.rawBody)
    } else {
      req.pipe(bb)
    }
  })
}

/**
 * Parser body uavhengig av om Content-Type er application/json, text/plain eller rå buffer
 * @param {import('express').Request} req
 * @returns {Record<string, any> | null}
 */
function getParsedBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body
  }
  let str = ''
  if (typeof req.body === 'string') {
    str = req.body
  } else if (Buffer.isBuffer(req.body)) {
    str = req.body.toString('utf8')
  } else if (req.rawBody) {
    str = Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : String(req.rawBody)
  }
  if (str) {
    try {
      return JSON.parse(str)
    } catch {
      return null
    }
  }
  return null
}

/**
 * Google Cloud Function HTTP Entry Point
 * Håndterer både:
 * 1. Bildeopplasting til Google Drive (multipart/form-data eller base64)
 * 2. TorTur Backend API (login, checkin, delete_checkin, update_checkin, getconfig) mot Google Sheets
 * 3. Helsekontroll og diagnostikk via GET
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function uploadCheckinImage(req, res) {
  setCorsHeaders(req, res)

  // 1. Håndter CORS Preflight (OPTIONS)
  if (req.method === 'OPTIONS') {
    return res.status(204).send('')
  }

  // 2. GET-forespørsler: Helsekontroll og diagnostikk
  if (req.method === 'GET') {
    const spreadsheetId = process.env.SPREADSHEET_ID || '<GOOGLESHEET-ID>'
    let sheetsStatus = 'unknown'
    try {
      const sheetsAuth = await getSheetsAuthClient()
      sheetsStatus = sheetsAuth ? 'connected' : 'no_auth'
    } catch (e) {
      sheetsStatus = `error: ${e.message}`
    }

    let driveStatus = 'unknown'
    try {
      const driveAuth = await getDriveAuthClient()
      driveStatus = driveAuth ? 'connected' : 'no_auth'
    } catch (e) {
      driveStatus = `error: ${e.message}`
    }

    return res.status(200).json({
      status: 'ok',
      app: 'TorTur Cloud Function API (Drive + Sheets)',
      node_version: process.version,
      timestamp: new Date().toISOString(),
      config: {
        spreadsheet_id: spreadsheetId ? 'configured' : 'missing',
        sheet_brukere: process.env.SHEET_BRUKERE || 'Brukere',
        sheet_system: process.env.SHEET_SYSTEM || 'SystemKonfigurasjon',
        sheet_innsjekk: process.env.SHEET_INNSJEKK || 'TurpostInnsjekk',
        innsjekk_folder_id: process.env.INNSJEKK_FOLDER_ID ? 'configured' : 'not_set',
      },
      sheets_auth: sheetsStatus,
      drive_auth: driveStatus,
      supported_actions: [
        'upload_image (multipart/form-data)',
        'login',
        'checkin',
        'delete_checkin',
        'update_checkin',
        'getconfig',
      ],
    })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Kun POST- og GET-forespørsler støttes.' })
  }

  try {
    const contentType = req.headers['content-type'] || ''

    // 3. Ekte binæropplasting via multipart/form-data til Google Drive
    if (contentType.includes('multipart/form-data')) {
      const { fields, file } = await parseMultipartRequest(req)
      const turpostId = fields.turpostId || 'ukjent'
      const idToken = fields.idToken || ''

      if (!file || !file.buffer || file.buffer.length === 0) {
        return res.status(400).json({ success: false, error: 'Mangler bildedata i forespørselen.' })
      }

      if (!idToken) {
        return res
          .status(401)
          .json({ success: false, error: 'Mangler idToken – autentisering påkrevd.' })
      }

      try {
        const ticket = await authVerifier.verifyIdToken({
          idToken,
          audience: process.env.CLIENT_ID,
        })
        const payload = ticket.getPayload()
        if (!payload?.email) {
          return res.status(403).json({ success: false, error: 'Ugyldig token – mangler e-post.' })
        }

        const isVerified = payload.email_verified === true || String(payload.email_verified) === 'true'
        if (!isVerified) {
          return res.status(403).json({ success: false, error: 'Google-kontoens e-post er ikke verifisert.' })
        }

        const userEmail = payload.email.toLowerCase().trim()
        const allowedRaw = process.env.ALLOWED_EMAILS || ''

        // 1. Rask vei: Sjekk ALLOWED_EMAILS miljøvariabel først
        let isAuthorized = false
        if (allowedRaw.trim()) {
          const allowedList = allowedRaw
            .split(/[,;\s]+/)
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean)
          if (allowedList.includes(userEmail)) {
            isAuthorized = true
          }
        }

        // 2. Fallback: Hvis e-post ikke er i ALLOWED_EMAILS (eller variabelen er tom), sjekk regnearket
        if (!isAuthorized) {
          const spreadsheetId = process.env.SPREADSHEET_ID
          const sheetBrukere = process.env.SHEET_BRUKERE || 'Brukere'
          if (!spreadsheetId) {
            console.error('[auth] SPREADSHEET_ID er ikke konfigurert for whitelist-fallback.')
            return res.status(500).json({ success: false, error: 'Serverkonfigurasjon mangler SPREADSHEET_ID.' })
          }

          const sheetsAuth = await getSheetsAuthClient()
          const sheets = getSheetsClient(sheetsAuth)
          isAuthorized = await isUserAuthorizedForUpload({
            email: userEmail,
            sheets,
            spreadsheetId,
            sheetBrukere,
          })
        }

        if (!isAuthorized) {
          console.warn(`[auth] Avvist e-post (verken i ALLOWED_EMAILS eller Brukere-arket): ${payload.email}`)
          return res.status(403).json({ success: false, error: 'Ikke autorisert.' })
        }
      } catch (authErr) {
        return res
          .status(403)
          .json({ success: false, error: `Ugyldig ID-token: ${authErr.message}` })
      }

      const authClient = await getDriveAuthClient()
      const result = await uploadImageToDrive({
        authClient,
        turpostId,
        fileBuffer: file.buffer,
        mimeType: file.mimeType || 'image/jpeg',
        fileName: file.filename || '',
      })

      return res.status(200).json({
        success: true,
        imageUrl: result.imageUrl,
        fileId: result.fileId,
        turpostId,
      })
    }

    // 4. JSON- og text/plain-forespørsler (TorTur Sheets API eller base64 Drive-opplasting)
    const body = getParsedBody(req)
    if (!body || typeof body !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Ugyldig eller manglende JSON i forespørselsinnholdet.',
      })
    }

    const action = String(body.action || 'login')
      .toLowerCase()
      .trim()
    const spreadsheetId = process.env.SPREADSHEET_ID
    const sheetBrukere = process.env.SHEET_BRUKERE
    const sheetSystem = process.env.SHEET_SYSTEM
    const sheetInnsjekk = process.env.SHEET_INNSJEKK
    const clientId = process.env.CLIENT_ID

    // Håndter Google Sheets-handlinger
    switch (action) {
      case 'login': {
        const sheetsAuth = await getSheetsAuthClient()
        const sheets = getSheetsClient(sheetsAuth)
        const result = await handleLogin({
          body,
          sheets,
          spreadsheetId,
          sheetBrukere,
          sheetSystem,
          authVerifier,
          clientId,
        })
        return res.status(200).json(result)
      }

      case 'checkin': {
        const [sheetsAuth, driveAuth] = await Promise.all([
          getSheetsAuthClient(),
          getDriveAuthClient(),
        ])
        const sheets = getSheetsClient(sheetsAuth)
        const result = await handleCheckin({
          body,
          sheets,
          spreadsheetId,
          sheetBrukere,
          sheetSystem,
          sheetInnsjekk,
          authVerifier,
          clientId,
          driveAuthClient: driveAuth,
        })
        return res.status(200).json(result)
      }

      case 'delete_checkin': {
        const [sheetsAuth, driveAuth] = await Promise.all([
          getSheetsAuthClient(),
          getDriveAuthClient(),
        ])
        const sheets = getSheetsClient(sheetsAuth)
        const result = await handleDeleteCheckin({
          body,
          sheets,
          spreadsheetId,
          sheetInnsjekk,
          authVerifier,
          clientId,
          driveAuthClient: driveAuth,
        })
        return res.status(200).json(result)
      }

      case 'update_checkin':
      case 'update_checkin_image': {
        const [sheetsAuth, driveAuth] = await Promise.all([
          getSheetsAuthClient(),
          getDriveAuthClient(),
        ])
        const sheets = getSheetsClient(sheetsAuth)
        const result = await handleUpdateCheckin({
          body,
          sheets,
          spreadsheetId,
          sheetInnsjekk,
          sheetSystem,
          authVerifier,
          clientId,
          driveAuthClient: driveAuth,
        })
        return res.status(200).json(result)
      }

      case 'getconfig':
      case 'config': {
        const sheetsAuth = await getSheetsAuthClient()
        const sheets = getSheetsClient(sheetsAuth)
        const result = await handleGetConfig({
          body,
          sheets,
          spreadsheetId,
          sheetSystem,
          authVerifier,
          clientId,
        })
        return res.status(200).json(result)
      }


      default: {
        return res.status(400).json({
          success: false,
          error: `Ukjent action: ${action}`,
        })
      }
    }
  } catch (err) {
    console.error('[uploadCheckinImage] Feil under behandling av forespørsel:', err)
    return res.status(500).json({
      success: false,
      error: 'Serverfeil: ' + (err.message || 'Ukjent feil.'),
    })
  }
}
