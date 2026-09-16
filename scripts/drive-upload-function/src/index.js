import busboy from 'busboy'
import { OAuth2Client } from 'google-auth-library'
import { getDriveAuthClient } from './auth.js'
import { uploadImageToDrive } from './driveService.js'

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

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
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
  return str.normalize('NFC').replace(/[\/\\]/g, '_').trim()
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
      defParamCharset: 'utf8'
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
          mimeType
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

    // Cloud Functions / Express håndterer rawBody hvis tilstede
    if (req.rawBody) {
      bb.end(req.rawBody)
    } else {
      req.pipe(bb)
    }
  })
}

/**
 * Google Cloud Function HTTP Entry Point
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function uploadCheckinImage(req, res) {
  setCorsHeaders(req, res)

  // 1. Håndter CORS Preflight (OPTIONS)
  if (req.method === 'OPTIONS') {
    return res.status(204).send('')
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Kun POST-forespørsler støttes.' })
  }

  try {
    const contentType = req.headers['content-type'] || ''
    let turpostId = ''
    let idToken = ''
    let fileBuffer = null
    let mimeType = 'image/jpeg'
    let fileName = ''

    // 2. Pars multipart/form-data
    if (contentType.includes('multipart/form-data')) {
      const { fields, file } = await parseMultipartRequest(req)
      turpostId = fields.turpostId || 'ukjent'
      idToken = fields.idToken || ''
      if (file) {
        fileBuffer = file.buffer
        mimeType = file.mimeType || 'image/jpeg'
        fileName = file.filename || ''
      }
    }
    // 3. Støtt også JSON med base64 for bakoverkompatibilitet og ytelsestesting
    else if (contentType.includes('application/json')) {
      const body = req.body || {}
      turpostId = body.turpostId || 'ukjent'
      idToken = body.idToken || ''

      const imageObj = body.image || {}
      let base64Data = imageObj.base64 || ''
      if (base64Data.includes(',')) {
        base64Data = base64Data.split(',')[1]
      }
      if (base64Data) {
        fileBuffer = Buffer.from(base64Data, 'base64')
        mimeType = imageObj.mimeType || 'image/jpeg'
        fileName = imageObj.fileName || ''
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Ugyldig Content-Type. Forventet multipart/form-data eller application/json.'
      })
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Mangler bildedata i forespørselen.'
      })
    }

    // 4. Valider Google ID-token (hvis sendt med og ikke slått av)
    if (idToken && process.env.REQUIRE_AUTH !== 'false') {
      try {
        const ticket = await authVerifier.verifyIdToken({
          idToken,
          audience: process.env.CLIENT_ID
        })
        const payload = ticket.getPayload()
        if (!payload) {
          console.warn('ID-token kunne ikke verifiseres, men fortsetter.')
        }
      } catch (authErr) {
        console.warn('Advarsel: Feil ved verifisering av idToken:', authErr.message)
      }
    }

    // 5. Hent autentisert Drive-klient og last opp bildet
    const authClient = await getDriveAuthClient()
    const result = await uploadImageToDrive({
      authClient,
      turpostId,
      fileBuffer,
      mimeType,
      fileName
    })

    return res.status(200).json({
      success: true,
      imageUrl: result.imageUrl,
      fileId: result.fileId,
      turpostId
    })
  } catch (err) {
    console.error('Feil under bildeopplasting til Drive:', err)
    return res.status(500).json({
      success: false,
      error: err.message || 'Ukjent feil under bildeopplasting.'
    })
  }
}
