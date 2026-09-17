import { ref, computed } from 'vue'
import type { SavedTrack } from '@/stores/gpsTrack'
import { formatTrackKey } from '@/composables/useFirebaseTracks'
import { getFirebaseConfig, fetchFirebase } from '@/composables/useAuth'
import { calculateDistanceMeters, type TrackPoint } from '@/composables/useGeolocation'

export interface TrackPhoto {
  id?: string
  fileId: string
  url: string
  thumbnailUrl?: string
  driveViewUrl?: string
  filename: string
  uploadedAt: number
  exifTimestamp?: number
  lat?: number
  lng?: number
}

export interface ExifInfo {
  timestamp?: number
  lat?: number
  lng?: number
}

const DRIVE_FOLDER_NAME = 'TorTur'
const STORAGE_KEY_FOLDER_ID = 'tortur_drive_folder_id'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

// Shared state for Drive authorization across components
const driveAccessToken = ref<string | null>(null)
const driveTokenExpiresAt = ref<number>(0)
const isAuthorizingDrive = ref<boolean>(false)

/**
 * Laster inn Google Identity Services-skriptet dersom det ikke allerede er lastet.
 */
function loadGIS(): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')
    if (existing) {
      if (window.google?.accounts?.oauth2) {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Klarte ikke laste Google Identity Services')))
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Klarte ikke laste Google Identity Services'))
    document.head.appendChild(script)
  })
}

/**
 * Leser EXIF-data fra en bildefil (tidspunkt og GPS-posisjon) i nettleseren.
 */
export async function readPhotoExif(file: File): Promise<ExifInfo> {
  try {
    const exifrModule = await import('exifr')
    const ex = exifrModule.default || exifrModule
    const data = (await ex.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude']
    })) as Record<string, unknown> | undefined

    let timestamp: number | undefined
    if (data?.DateTimeOriginal instanceof Date && !isNaN(data.DateTimeOriginal.getTime())) {
      timestamp = data.DateTimeOriginal.getTime()
    } else if (data?.CreateDate instanceof Date && !isNaN(data.CreateDate.getTime())) {
      timestamp = data.CreateDate.getTime()
    } else if (typeof data?.DateTimeOriginal === 'string') {
      const parsed = Date.parse(data.DateTimeOriginal)
      if (!isNaN(parsed)) timestamp = parsed
    }

    let lat: number | undefined
    let lng: number | undefined
    if (typeof data?.latitude === 'number' && typeof data?.longitude === 'number') {
      lat = data.latitude
      lng = data.longitude
    } else {
      try {
        const gpsData = (await ex.gps(file)) as { latitude?: number; longitude?: number } | undefined
        if (gpsData && typeof gpsData.latitude === 'number' && typeof gpsData.longitude === 'number') {
          lat = gpsData.latitude
          lng = gpsData.longitude
        }
      } catch {
        // GPS parsing feilet, fortsett uten GPS
      }
    }

    return { timestamp, lat, lng }
  } catch (err) {
    console.warn('[useTrackPhotos] Kunne ikke lese EXIF:', err)
    return {}
  }
}

/**
 * Sjekker om et bilde-tidsstempel faller innenfor tidsrommet turen varte.
 * @param fileTime Tidsstempel i millisekunder
 * @param trackStart Starttidspunkt for turen i millisekunder
 * @param trackEnd Sluttidspunkt for turen i millisekunder
 * @param bufferMs Tillatt tidsmargin før start og etter slutt (standard 30 min)
 */
export function isFileWithinTrackTime(
  fileTime: number,
  trackStart: number,
  trackEnd: number,
  bufferMs: number = 30 * 60 * 1000
): boolean {
  if (!trackStart) return true
  const minTime = trackStart - bufferMs
  const maxTime = Math.max(trackEnd || trackStart, trackStart) + bufferMs
  return fileTime >= minTime && fileTime <= maxTime
}

/**
 * Formaterer mappenavnet for et spor i formatet "YYYY.MM.DD Spornavn",
 * f.eks. "2026.09.15 Fløyen".
 */
export function formatTrackFolderName(track: SavedTrack): string {
  const ts = track.startTime || track.createdAt || Date.now()
  const date = new Date(ts)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const cleanName = (track.name || 'Tur').trim().replace(/[/\\?%*:|"<>]/g, '_')
  return `${yyyy}.${mm}.${dd} ${cleanName}`
}

/**
 * Sjekker om et bilde med GPS-koordinater befinner seg nær et GPS-spor.
 * @param photo Bildeobjekt med lat/lng
 * @param points Liste med spor-punkter
 * @param maxDistanceMeters Maks avstand i meter til nærmeste punkt på sporet (standard 300m)
 */
export function isPhotoNearTrack(
  photo: TrackPhoto,
  points: TrackPoint[],
  maxDistanceMeters: number = 300
): boolean {
  if (typeof photo.lat !== 'number' || typeof photo.lng !== 'number') return false
  if (!points || points.length === 0) return false

  for (const pt of points) {
    const dist = calculateDistanceMeters(photo.lat, photo.lng, pt.lat, pt.lng)
    if (dist <= maxDistanceMeters) {
      return true
    }
  }
  return false
}

export function useTrackPhotos() {
  const isDriveAuthorized = computed(() => {
    return !!driveAccessToken.value && Date.now() < driveTokenExpiresAt.value
  })

  /**
   * Ber brukeren om autorisasjon til Google Drive (drive.file scope) via Google Identity Services.
   */
  async function requestDriveAccess(): Promise<string> {
    if (driveAccessToken.value && Date.now() < driveTokenExpiresAt.value - 60000) {
      return driveAccessToken.value
    }

    isAuthorizingDrive.value = true
    try {
      await loadGIS()
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
      if (!clientId) {
        throw new Error('VITE_GOOGLE_CLIENT_ID er ikke konfigurert i .env')
      }

      const google = window.google
      if (!google?.accounts?.oauth2) {
        throw new Error('Google Identity Services (OAuth2) er ikke tilgjengelig')
      }

      return await new Promise<string>((resolve, reject) => {
        const tokenClient = google.accounts!.oauth2!.initTokenClient({
          client_id: clientId,
          scope: DRIVE_SCOPE,
          callback: (response) => {
            isAuthorizingDrive.value = false
            if (response.error) {
              reject(new Error(response.error_description || response.error))
              return
            }
            if (response.access_token) {
              driveAccessToken.value = response.access_token
              const expiresIn = response.expires_in || 3600
              driveTokenExpiresAt.value = Date.now() + expiresIn * 1000
              resolve(response.access_token)
            } else {
              reject(new Error('Ingen tilgangstoken mottatt fra Google'))
            }
          }
        })
        tokenClient.requestAccessToken()
      })
    } catch (err) {
      isAuthorizingDrive.value = false
      throw err
    }
  }

  /**
   * Finner eller oppretter mappen 'TorTur' på brukerens Google Drive.
   */
  async function getOrCreateTorturFolder(accessToken: string): Promise<string> {
    const cachedFolderId = localStorage.getItem(STORAGE_KEY_FOLDER_ID)
    if (cachedFolderId) {
      // Bekreft at mappen fortsatt eksisterer og er tilgjengelig
      try {
        const checkRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cachedFolderId)}?fields=id,trashed`,
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        )
        if (checkRes.ok) {
          const folderData = (await checkRes.json()) as { id?: string; trashed?: boolean }
          if (folderData.id && !folderData.trashed) {
            return folderData.id
          }
        }
      } catch {
        // Fortsett til søk hvis sjekk feilet
      }
    }

    // Søk etter eksisterende mappe 'TorTur' opprettet av appen
    try {
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name%3D'${DRIVE_FOLDER_NAME}'+and+mimeType%3D'application%2Fvnd.google-apps.folder'+and+trashed%3Dfalse&fields=files(id%2Cname)`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      )
      if (searchRes.ok) {
        const data = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> }
        if (data.files && data.files.length > 0 && data.files[0]?.id) {
          const folderId = data.files[0].id
          localStorage.setItem(STORAGE_KEY_FOLDER_ID, folderId)
          return folderId
        }
      }
    } catch (err) {
      console.warn('[useTrackPhotos] Søk etter TorTur-mappe feilet:', err)
    }

    // Mappe fantes ikke; opprett den
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: DRIVE_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder'
      })
    })

    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => '')
      throw new Error(`Kunne ikke opprette TorTur-mappe på Google Drive: ${errText}`)
    }

    const newFolder = (await createRes.json()) as { id: string }
    localStorage.setItem(STORAGE_KEY_FOLDER_ID, newFolder.id)
    return newFolder.id
  }

  /**
   * Finner eller oppretter undermappen for det spesifikke sporet under 'TorTur' på Google Drive.
   * Mappen får navn i formatet "YYYY.MM.DD Spornavn", f.eks. "2026.09.15 Fløyen".
   */
  async function getOrCreateTrackFolder(
    parentFolderId: string,
    track: SavedTrack,
    accessToken: string
  ): Promise<string> {
    const folderName = formatTrackFolderName(track)
    const trackKey = track.firebaseKey || formatTrackKey(track.startTime || track.createdAt)
    const cacheKey = `tortur_drive_track_folder_${trackKey}`
    const cachedFolderId = localStorage.getItem(cacheKey)

    if (cachedFolderId) {
      try {
        const checkRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cachedFolderId)}?fields=id,trashed`,
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        )
        if (checkRes.ok) {
          const folderData = (await checkRes.json()) as { id?: string; trashed?: boolean }
          if (folderData.id && !folderData.trashed) {
            return folderData.id
          }
        }
      } catch {
        // Fortsett til søk hvis sjekk feilet
      }
    }

    // Søk etter eksisterende undermappe under parentFolderId
    try {
      const escapedName = folderName.replace(/'/g, "\\'")
      const q = `'${parentFolderId}' in parents and name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      )
      if (searchRes.ok) {
        const data = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> }
        if (data.files && data.files.length > 0 && data.files[0]?.id) {
          const folderId = data.files[0].id
          localStorage.setItem(cacheKey, folderId)
          return folderId
        }
      }
    } catch (err) {
      console.warn('[useTrackPhotos] Søk etter spormappe feilet:', err)
    }

    // Mappe fantes ikke under TorTur; opprett den
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId]
      })
    })

    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => '')
      throw new Error(`Kunne ikke opprette spormappe på Google Drive: ${errText}`)
    }

    const newFolder = (await createRes.json()) as { id: string }
    localStorage.setItem(cacheKey, newFolder.id)
    return newFolder.id
  }

  /**
   * Laster opp en uendret bildefil direkte til brukerens Google Drive via multipart upload.
   */
  async function uploadFileToDrive(
    file: File,
    folderId: string,
    accessToken: string
  ): Promise<{ fileId: string; webViewLink?: string }> {
    const metadata = {
      name: file.name,
      parents: [folderId]
    }

    const boundary = '-------tortur_' + Math.random().toString(36).substring(2)
    const closeDelimiter = `\r\n--${boundary}--`

    const metaBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json; charset=UTF-8' })
    const multipartBody = new Blob(
      [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
        metaBlob,
        `\r\n--${boundary}\r\nContent-Type: ${file.type || 'image/jpeg'}\r\n\r\n`,
        file,
        closeDelimiter
      ],
      { type: `multipart/related; boundary=${boundary}` }
    )

    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        body: multipartBody
      }
    )

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Google Drive opplasting feilet (HTTP ${res.status}): ${errText}`)
    }

    const result = (await res.json()) as { id: string; webViewLink?: string }
    return { fileId: result.id, webViewLink: result.webViewLink }
  }

  /**
   * Setter lesetilgang for 'anyone with link' på filen slik at bildet kan vises i <img>-tag.
   */
  async function makeFileAccessible(fileId: string, accessToken: string): Promise<void> {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    })

    if (!res.ok) {
      console.warn(`[useTrackPhotos] Kunne ikke sette deling for fil ${fileId}: HTTP ${res.status}`)
    }
  }

  /**
   * Lagrer metadata for et turbilde i Firebase Realtime Database.
   * Sti: /<prefix>/brukere/<userId>/track_photos/<trackKey>/<pushId>.json
   */
  async function savePhotoToFirebase(
    userId: string,
    trackKey: string,
    photoData: Omit<TrackPhoto, 'id'>
  ): Promise<TrackPhoto | null> {
    if (!userId || userId === 'guest' || !trackKey) return null

    const config = await getFirebaseConfig()
    if (!config) return null

    try {
      const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/track_photos/${encodeURIComponent(trackKey)}.json`
      const res = await fetchFirebase(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(photoData)
      })

      if (!res.ok) {
        console.warn('[useTrackPhotos] Kunne ikke lagre bildemetadata i Firebase:', res.status)
        return null
      }

      const resData = (await res.json()) as { name?: string }
      return {
        ...photoData,
        id: resData.name || undefined
      }
    } catch (err) {
      console.warn('[useTrackPhotos] Feil ved lagring i Firebase:', err)
      return null
    }
  }

  /**
   * Henter alle lagrede turbilder for et gitt spor fra Firebase RTDB.
   */
  async function fetchTrackPhotos(userId: string, trackKey: string): Promise<TrackPhoto[]> {
    if (!userId || userId === 'guest' || !trackKey) return []

    const config = await getFirebaseConfig()
    if (!config) return []

    try {
      const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/track_photos/${encodeURIComponent(trackKey)}.json`
      const res = await fetchFirebase(url)
      if (!res.ok) return []

      const data = (await res.json()) as Record<string, unknown> | null
      if (!data || typeof data !== 'object') return []

      const photos: TrackPhoto[] = []
      for (const [id, val] of Object.entries(data)) {
        if (!val || typeof val !== 'object') continue
        const item = val as Record<string, unknown>
        if (typeof item.fileId !== 'string' || typeof item.url !== 'string') continue

        photos.push({
          id,
          fileId: item.fileId,
          url: item.url,
          thumbnailUrl: typeof item.thumbnailUrl === 'string' ? item.thumbnailUrl : undefined,
          driveViewUrl: typeof item.driveViewUrl === 'string' ? item.driveViewUrl : undefined,
          filename: typeof item.filename === 'string' ? item.filename : 'Bilde',
          uploadedAt: typeof item.uploadedAt === 'number' ? item.uploadedAt : Date.now(),
          exifTimestamp: typeof item.exifTimestamp === 'number' ? item.exifTimestamp : undefined,
          lat: typeof item.lat === 'number' ? item.lat : undefined,
          lng: typeof item.lng === 'number' ? item.lng : undefined
        })
      }

      return photos.sort((a, b) => (a.exifTimestamp || a.uploadedAt) - (b.exifTimestamp || b.uploadedAt))
    } catch (err) {
      console.warn('[useTrackPhotos] Kunne ikke hente turbilder fra Firebase:', err)
      return []
    }
  }

  /**
   * Sletter et turbilde fra Firebase RTDB og forsøker å slette filen fra Google Drive.
   */
  async function deleteTrackPhoto(
    userId: string,
    trackKey: string,
    photo: TrackPhoto
  ): Promise<boolean> {
    if (!userId || userId === 'guest' || !trackKey || !photo.id) return false

    const config = await getFirebaseConfig()
    if (!config) return false

    try {
      // 1. Slett fra Firebase RTDB
      const url = `${config.dbUrl}/${config.prefix}/brukere/${encodeURIComponent(userId)}/track_photos/${encodeURIComponent(trackKey)}/${encodeURIComponent(photo.id)}.json`
      const res = await fetchFirebase(url, {
        method: 'DELETE'
      })

      if (!res.ok) return false

      // 2. Hvis vi har aktiv Drive-tilgang, slett også filen fra Drive
      if (driveAccessToken.value && photo.fileId) {
        try {
          await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(photo.fileId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${driveAccessToken.value}` }
          })
        } catch {
          // Ignorer slettefeil i Drive
        }
      }

      return true
    } catch (err) {
      console.warn('[useTrackPhotos] Feil ved sletting av turbilde:', err)
      return false
    }
  }

  /**
   * Laster opp ett bilde: leser EXIF -> laster opp til Drive -> setter deling -> lagrer i Firebase RTDB.
   */
  async function uploadSingleTrackPhoto(
    file: File,
    track: SavedTrack,
    userId: string,
    folderId: string,
    accessToken: string
  ): Promise<TrackPhoto | null> {
    // 1. Les EXIF-data i nettleseren før opplasting
    const exif = await readPhotoExif(file)

    // 2. Last opp uendret fil til Google Drive
    const driveUpload = await uploadFileToDrive(file, folderId, accessToken)

    // 3. Sett lesetilgang så bildet kan vises i <img>
    await makeFileAccessible(driveUpload.fileId, accessToken)

    // 4. Bygg bildeobjekt
    const trackKey = track.firebaseKey || formatTrackKey(track.startTime || track.createdAt)
    const photoData: Omit<TrackPhoto, 'id'> = {
      fileId: driveUpload.fileId,
      url: `https://lh3.googleusercontent.com/d/${driveUpload.fileId}`,
      thumbnailUrl: `https://drive.google.com/thumbnail?id=${driveUpload.fileId}&sz=w600`,
      driveViewUrl: driveUpload.webViewLink || `https://drive.google.com/file/d/${driveUpload.fileId}/view`,
      filename: file.name,
      uploadedAt: Date.now(),
      exifTimestamp: exif.timestamp || file.lastModified,
      lat: exif.lat,
      lng: exif.lng
    }

    // 5. Lagre i Firebase RTDB
    return await savePhotoToFirebase(userId, trackKey, photoData)
  }

  return {
    isDriveAuthorized,
    isAuthorizingDrive,
    requestDriveAccess,
    getOrCreateTorturFolder,
    getOrCreateTrackFolder,
    uploadFileToDrive,
    makeFileAccessible,
    savePhotoToFirebase,
    fetchTrackPhotos,
    deleteTrackPhoto,
    uploadSingleTrackPhoto
  }
}
