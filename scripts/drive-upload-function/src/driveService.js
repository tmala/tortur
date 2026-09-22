import { google } from 'googleapis'
import { Readable } from 'stream'

/**
 * Finner eller oppretter en mappe for en gitt turpost
 * @param {import('googleapis').drive_v3.Drive} drive
 * @param {string} turpostId
 * @param {string|null} baseFolderId
 * @returns {Promise<string>} folderId
 */
async function getOrCreateTurpostFolder(drive, turpostId, baseFolderId) {
  const folderName = String(turpostId || 'ukjent').trim()
  const parentQuery = baseFolderId ? `'${baseFolderId}' in parents` : `'root' in parents`
  const q = `name = '${folderName}' and ${parentQuery} and mimeType = 'application/vnd.google-apps.folder' and trashed = false`

  const listRes = await drive.files.list({
    q,
    fields: 'files(id, name)',
    spaces: 'drive'
  })

  if (listRes.data.files && listRes.data.files.length > 0) {
    return listRes.data.files[0].id
  }

  // Opprett undermappen hvis den ikke finnes
  const fileMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: baseFolderId ? [baseFolderId] : undefined
  }

  const folder = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id'
  })

  const folderId = folder.data.id

  // Prøv å sette delingstilgang så bilder i mappen kan vises
  try {
    await drive.permissions.create({
      fileId: folderId,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    })
  } catch (err) {
    console.warn('Kunne ikke sette deling på mappen (fortsetter likevel):', err.message)
  }

  return folderId
}

/**
 * Laster opp et bilde til Google Drive under riktig turpost-mappe
 * @param {Object} params
 * @param {InstanceType<typeof google.auth.OAuth2>} params.authClient
 * @param {string} params.turpostId
 * @param {Buffer} params.fileBuffer
 * @param {string} params.mimeType
 * @param {string} params.fileName
 * @returns {Promise<{ fileId: string, imageUrl: string }>}
 */
export async function uploadImageToDrive({
  authClient,
  turpostId,
  fileBuffer,
  mimeType = 'image/jpeg',
  fileName
}) {
  const drive = google.drive({ version: 'v3', auth: authClient })
  const baseFolderId = process.env.INNSJEKK_FOLDER_ID ? process.env.INNSJEKK_FOLDER_ID.trim() : null

  const targetFolderId = await getOrCreateTurpostFolder(drive, turpostId, baseFolderId)

  const finalFileName =
    fileName || `innsjekk_${Date.now()}.${mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'}`

  const mediaStream = Readable.from(fileBuffer)

  const res = await drive.files.create({
    requestBody: {
      name: finalFileName,
      parents: [targetFolderId]
    },
    media: {
      mimeType,
      body: mediaStream
    },
    fields: 'id, name'
  })

  const fileId = res.data.id

  // Gjør bildet offentlig lesbart med lenke
  try {
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    })
  } catch (permErr) {
    console.warn('Kunne ikke sette delingstillatelse for fil:', permErr.message)
  }

  // Samme URL-format som Apps Script genererer
  const imageUrl = `https://lh3.googleusercontent.com/d/${fileId}`

  return {
    fileId,
    imageUrl
  }
}

/**
 * Sletter et bilde fra Google Drive basert på bilde-URL eller fil-ID
 * @param {Object} params
 * @param {InstanceType<typeof google.auth.OAuth2>} params.authClient
 * @param {string} params.imageUrl
 * @returns {Promise<boolean>}
 */
export async function deleteImageFromDrive({ authClient, imageUrl }) {
  if (!imageUrl || typeof imageUrl !== 'string') return false

  // Trekk ut fil-ID fra f.eks. https://lh3.googleusercontent.com/d/FILE_ID eller ?id=FILE_ID
  let fileId = ''
  const lh3Match = imageUrl.match(/\/d\/([a-zA-Z0-9_-]+)/)
  if (lh3Match) {
    fileId = lh3Match[1]
  } else {
    const queryMatch = imageUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/)
    if (queryMatch) {
      fileId = queryMatch[1]
    }
  }

  if (!fileId) {
    return false
  }

  try {
    const drive = google.drive({ version: 'v3', auth: authClient })
    await drive.files.delete({ fileId })
    return true
  } catch (err) {
    console.warn(`[driveService] Kunne ikke slette bilde (${fileId}) fra Google Drive:`, err.message)
    return false
  }
}

