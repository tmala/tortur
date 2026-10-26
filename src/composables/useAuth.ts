import { ref, computed } from 'vue'
import {
  signInWithGoogleIdToken,
  signOutFirebase,
  fetchFirebase,
  getFirebaseIdToken,
  getFirebaseAuth,
  isJwtExpired,
} from '@/services/firebase'
import { isValidUserId, normalizeUserId } from '@/utils/userId'
import { cachedFetchJson, clearRtdbCache } from '@/services/rtdbCache'

export { fetchFirebase, getFirebaseIdToken }

export interface GoogleUser {
  userId: string
  userName: string
  email: string
  avatarUrl: string
  lastLogin: string
  isAdmin?: boolean
}

export interface SystemConfig {
  AIS_CLIENT_ID?: string
  AIS_CLIENT_SECRET?: string
  FIREBASE_DB_URL?: string
  FIREBASE_SECRET_PREFIX?: string
  MAPBOX_TOKEN?: string
  [key: string]: string | undefined
}

export interface CheckinParams {
  turpostId: string | number
  turpostName?: string
  description: string
  imageFile?: File | null
  trackId?: string
  visibility?: 'all' | 'friends' | 'private'
}

export interface CheckinResult {
  id?: string
  userId: string
  turpostId: string
  turpostName?: string
  timestamp: string
  description: string
  imageUrl: string
  userName?: string
  userAvatar?: string
  visibility?: 'all' | 'friends' | 'private'
  trackId?: string
}

export type CheckinReactionType = 'like' | 'love' | 'laugh' | 'sad' | 'wow' | 'angry'

export interface CheckinReaction {
  userId: string
  userName: string
  userAvatar?: string
  reaction: CheckinReactionType
  emoji: string
  timestamp?: string
}

export interface CheckinComment {
  id: string
  userId: string
  userName: string
  userAvatar?: string
  text: string
  timestamp: string
}

export interface FirebaseCheckinItem {
  id: string
  userId: string
  userName: string
  userAvatar: string
  turpostId: string
  turpostName?: string
  timestamp: string
  description: string
  imageUrl: string
  isPrivate?: boolean
  spotId?: string
  visibility?: 'all' | 'friends' | 'private'
  likes?: Record<string, CheckinReaction>
  comments?: Record<string, CheckinComment>
  trackId?: string
}

const STORAGE_KEY_USER   = 'tortur_user'
const STORAGE_KEY_CONFIG = 'tortur_system_config'
const STORAGE_KEY_TOKEN  = 'tortur_id_token'

const API_URL = import.meta.env.VITE_API_URL as string
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
function getDriveUploadUrl(): string | undefined {
  return (import.meta.env.VITE_DRIVE_UPLOAD_URL as string | undefined)?.trim()
}

// Singleton state – delt på tvers av alle useAuth()-kall
const user           = ref<GoogleUser | null>(null)
const systemConfig   = ref<SystemConfig>({})
const currentIdToken = ref<string | null>(null)
const isLoading      = ref(false)
const error          = ref<string | null>(null)
let   gisLoaded      = false

// Gjenopprett fra localStorage/sessionStorage ved første import
try {
  const savedUser = localStorage.getItem(STORAGE_KEY_USER)
  if (savedUser) {
    try {
      const parsedUser = JSON.parse(savedUser) as GoogleUser
      if (parsedUser && typeof parsedUser === 'object') {
        const cleanUid = normalizeUserId(parsedUser.userId)
        if (cleanUid) {
          parsedUser.userId = cleanUid
          user.value = parsedUser
        } else {
          console.warn('[useAuth] Lagret bruker i localStorage har ugyldig userId, fjerner innlogging.')
          localStorage.removeItem(STORAGE_KEY_USER)
          user.value = null
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY_USER)
      user.value = null
    }
  }

  const savedConfig = localStorage.getItem(STORAGE_KEY_CONFIG)
  if (savedConfig) systemConfig.value = JSON.parse(savedConfig)

  const savedToken = sessionStorage.getItem(STORAGE_KEY_TOKEN)
  if (savedToken) {
    if (isJwtExpired(savedToken)) {
      sessionStorage.removeItem(STORAGE_KEY_TOKEN)
      currentIdToken.value = null
    } else {
      currentIdToken.value = savedToken
      const authInstance = getFirebaseAuth()
      if (authInstance && typeof authInstance.authStateReady === 'function') {
        authInstance.authStateReady().then(() => {
          if (!authInstance.currentUser && currentIdToken.value) {
            signInWithGoogleIdToken(currentIdToken.value).then((fbCred) => {
              if (fbCred?.user?.uid && user.value?.userId) {
                syncAuthUid(user.value.userId, fbCred.user.uid).catch(() => {})
                if (user.value.isAdmin) {
                  syncAdminStatus(fbCred.user.uid, true).catch(() => {})
                }
              }
            }).catch(() => {})
          }
        }).catch(() => {})
      }
    }
  }
} catch {
  // Ugyldig data – ignorer
}

export async function syncAuthUid(userId: string, authUid: string): Promise<void> {
  if (!userId || !authUid) return
  const fbConfig = await getFirebaseConfig()
  if (!fbConfig) return
  try {
    const authUidUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/auth_uids/${encodeURIComponent(authUid)}.json`
    const userAuthUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(userId)}/auth_uid.json`
    await Promise.all([
      fetchFirebase(authUidUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(userId) }),
      fetchFirebase(userAuthUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(authUid) })
    ])
  } catch (err) {
    console.warn('[useAuth] Feil ved synkronisering av auth_uid:', err)
  }
}

export async function syncAdminStatus(authUid: string, isAdmin: boolean): Promise<void> {
  if (!authUid || !isAdmin) return
  const fbConfig = await getFirebaseConfig()
  if (!fbConfig) return
  try {
    const adminUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/admins/${encodeURIComponent(authUid)}.json`
    await fetchFirebase(adminUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(true)
    })
  } catch (err) {
    console.warn('[useAuth] Feil ved synkronisering av admin-status:', err)
  }
}

// =============================================================================
// Last Google Identity Services SDK dynamisk
// =============================================================================
function loadGIS(): Promise<void> {
  if (gisLoaded || window.google?.accounts?.id) {
    gisLoaded = true
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => { gisLoaded = true; resolve() }
    script.onerror = () => reject(new Error('Klarte ikke laste Google Identity Services'))
    document.head.appendChild(script)
  })
}

// =============================================================================
// Send id_token til Cloud Function backend og valider whitelist
// =============================================================================
async function loginWithToken(idToken: string): Promise<void> {
  if (!API_URL) {
    error.value = 'VITE_API_URL er ikke konfigurert i .env'
    return
  }

  isLoading.value = true
  error.value = null

  try {
    // NB: 'application/json' trigger CORS preflight. 'text/plain' er en "simple request" og unngår preflight.
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'login', idToken })
    })

    // Sjekk HTTP-statuskode før vi prøver å parse JSON
    if (!response.ok) {
      error.value = `API-serveren svarte med HTTP ${response.status}. Sjekk at VITE_API_URL i .env er oppdatert.`
      return
    }

    // Defensiv JSON-parsing – API kan returnere HTML ved feilkonfig
    const text = await response.text()
    let data: Record<string, unknown>
    try {
      data = JSON.parse(text)
    } catch {
      console.error('[useAuth] Ugyldig JSON fra API:', text.slice(0, 200))
      error.value = 'API-serveren returnerte ugyldig svar (ikke JSON). Sjekk at VITE_API_URL i .env er riktig konfigurert.'
      return
    }

    if (!data.success) {
      error.value = (data.error as string) || 'Innlogging feilet'
      return
    }

    const rawUser = data.user as GoogleUser | undefined
    const cleanUserId = normalizeUserId(rawUser?.userId)
    if (!rawUser || !cleanUserId) {
      error.value = 'Mottok ugyldig bruker-ID fra serveren.'
      return
    }
    rawUser.userId = cleanUserId

    user.value         = rawUser
    systemConfig.value = (data.systemConfig || {}) as SystemConfig
    currentIdToken.value = idToken

    localStorage.setItem(STORAGE_KEY_USER,   JSON.stringify(user.value))
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(systemConfig.value))
    sessionStorage.setItem(STORAGE_KEY_TOKEN, idToken)

    // Logg inn i Firebase Auth med samme Google-token for sikker tilgang til Realtime Database
    try {
      const fbCred = await signInWithGoogleIdToken(idToken)
      if (fbCred?.user?.uid && user.value) {
        syncAuthUid(user.value.userId, fbCred.user.uid).catch(() => {})
        if (user.value.isAdmin) {
          syncAdminStatus(fbCred.user.uid, true).catch(() => {})
        }
      }
    } catch (fbAuthErr) {
      console.warn('[useAuth] Firebase Auth innlogging feilet (fortsetter med Cloud Function sesjon):', fbAuthErr)
    }
  } catch (err) {
    error.value = 'Kunne ikke nå innloggingsserveren. Sjekk nettverkstilkoblingen.'
    console.error('[useAuth] Login-feil:', err)
  } finally {
    isLoading.value = false
  }
}

// =============================================================================
// Initier Google Identity Services og trigger One Tap / popup
// =============================================================================
async function login(): Promise<void> {
  if (!GOOGLE_CLIENT_ID) {
    error.value = 'VITE_GOOGLE_CLIENT_ID er ikke konfigurert i .env'
    return
  }

  try {
    await loadGIS()
    const google = window.google
    const gisId = google?.accounts?.id
    if (!gisId) {
      error.value = 'Google Identity Services er ikke tilgjengelig'
      return
    }

    gisId.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response: { credential?: string }) => {
        if (response.credential) {
          loginWithToken(response.credential)
        } else {
          error.value = 'Ingen legitimasjon mottatt fra Google'
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true
    })

    // Forsøk å vise One Tap-prompt. Hvis det ikke er mulig (f.eks. Safari ITP / FedCM),
    // ignoreres det stille – brukeren kan uansett bruke «Fortsett med Google»-knappen i modalen.
    gisId.prompt()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Innlogging feilet'
  }
}

// =============================================================================
// Logg ut
// =============================================================================
function logout(): void {
  signOutFirebase().catch(() => {})
  user.value           = null
  systemConfig.value   = {}
  currentIdToken.value = null
  error.value          = null
  localStorage.removeItem(STORAGE_KEY_USER)
  localStorage.removeItem(STORAGE_KEY_CONFIG)
  sessionStorage.removeItem(STORAGE_KEY_TOKEN)
  migratedUsersCache.clear()
  clearRtdbCache().catch(() => {})

  try {
    const google = window.google
    if (google?.accounts?.id) {
      google.accounts.id.disableAutoSelect()
    }
  } catch {
    // Ignorer – GIS ikke lastet
  }
}

// =============================================================================
// Konverter bildefil til base64 data-URL
// =============================================================================
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Kunne ikke lese bildefil som data-URL.'))
      }
    }
    reader.onerror = () => reject(new Error('Kunne ikke lese bildefil.'))
    reader.readAsDataURL(file)
  })
}

// =============================================================================
// Last opp bilde direkte til Google Cloud Function (multipart/form-data)
// =============================================================================
async function uploadImageToDrive(
  file: File,
  turpostId: string | number,
  idToken?: string
): Promise<string> {
  const driveUploadUrl = getDriveUploadUrl()
  if (!driveUploadUrl) {
    throw new Error('VITE_DRIVE_UPLOAD_URL er ikke konfigurert.')
  }
  const formData = new FormData()
  formData.append('file', file)
  formData.append('turpostId', String(turpostId))
  if (idToken) {
    formData.append('idToken', idToken)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 35_000)
  try {
    const res = await fetch(driveUploadUrl, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    })
    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as Record<string, unknown>
      throw new Error((errData.error as string) || `Opplasting til Google Drive feilet med status ${res.status}`)
    }
    const data = (await res.json()) as { success?: boolean; imageUrl?: string; error?: string }
    if (!data.success || !data.imageUrl) {
      throw new Error(data.error || 'Mangler bilde-URL fra opplastingstjenesten.')
    }
    return data.imageUrl
  } finally {
    clearTimeout(timeoutId)
  }
}

// =============================================================================
// Send innsjekk til backend (Google Cloud Function)
// =============================================================================
async function submitCheckin(params: CheckinParams): Promise<CheckinResult> {
  if (!API_URL) {
    throw new Error('VITE_API_URL er ikke konfigurert i miljøvariabler.')
  }
  if (!user.value) {
    throw new Error('Du må være innlogget for å sjekke inn.')
  }

  let uploadedImageUrl: string | undefined = undefined
  let imagePayload: { base64: string; mimeType: string; fileName: string } | undefined

  if (params.imageFile) {
    const driveUploadUrl = getDriveUploadUrl()
    if (driveUploadUrl) {
      try {
        uploadedImageUrl = await uploadImageToDrive(
          params.imageFile,
          params.turpostId,
          currentIdToken.value || undefined
        )
      } catch (uploadErr: unknown) {
        console.warn('Bildeopplasting via Cloud Function feilet, bruker fallback til API/AppsScript:', uploadErr)
        const base64 = await fileToBase64(params.imageFile)
        imagePayload = {
          base64,
          mimeType: params.imageFile.type || 'image/jpeg',
          fileName: params.imageFile.name || `innsjekk_${Date.now()}.jpg`
        }
      }
    } else {
      const base64 = await fileToBase64(params.imageFile)
      imagePayload = {
        base64,
        mimeType: params.imageFile.type || 'image/jpeg',
        fileName: params.imageFile.name || `innsjekk_${Date.now()}.jpg`
      }
    }
  }

  const payload = {
    action: 'checkin',
    idToken: currentIdToken.value || undefined,
    userId: user.value.userId,
    email: user.value.email,
    turpostId: String(params.turpostId),
    turpostName: params.turpostName || '',
    description: params.description || '',
    imageUrl: uploadedImageUrl,
    image: imagePayload,
    trackId: params.trackId || undefined
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 45_000)
  let response: Response
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Nettverksforespørselen tok for lang tid (tidsavbrudd etter 45 sekunder). Sjekk internettforbindelsen og prøv igjen.')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    throw new Error(`Tjeneren svarte med feilstatus ${response.status}`)
  }

  const text = await response.text()
  let data: Record<string, unknown>
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Ugyldig svar fra tjeneren (ikke JSON).')
  }

  if (!data.success) {
    throw new Error((data.error as string) || 'Innsjekking feilet.')
  }

  if (data.systemConfig && typeof data.systemConfig === 'object') {
    systemConfig.value = data.systemConfig as SystemConfig
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(data.systemConfig))
  }

  const checkinResult = data.checkin as CheckinResult
  if (checkinResult?.userId) {
    checkinResult.userId = normalizeUserId(checkinResult.userId) || checkinResult.userId
  }

  // Synkroniser innsjekkingen direkte til Firebase Realtime Database fra webappen
  const fbConfig = await getFirebaseConfig()
  if (fbConfig && checkinResult.id && user.value && isValidUserId(user.value.userId)) {
    try {
      const cleanUserId = normalizeUserId(user.value.userId)
      const visibility = params.visibility || checkinResult.visibility || 'all'
      checkinResult.visibility = visibility
      const firebaseItem: FirebaseCheckinItem = {
        id: checkinResult.id,
        userId: cleanUserId,
        userName: user.value.userName,
        userAvatar: user.value.avatarUrl || '',
        turpostId: String(params.turpostId),
        turpostName: params.turpostName || '',
        timestamp: checkinResult.timestamp || new Date().toISOString(),
        description: params.description || '',
        imageUrl: checkinResult.imageUrl || '',
        trackId: params.trackId || checkinResult.trackId || undefined,
        visibility
      }
      const itemJson = JSON.stringify(firebaseItem)
      const promises: Promise<unknown>[] = []

      if (visibility === 'private') {
        const privateUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(cleanUserId)}/private_checkins/${encodeURIComponent(checkinResult.id)}.json`
        promises.push(fetchFirebase(privateUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: itemJson }))
      } else {
        const friendsUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(cleanUserId)}/friends_checkins/${encodeURIComponent(checkinResult.id)}.json`
        promises.push(fetchFirebase(friendsUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: itemJson }))

        if (visibility === 'all') {
          const turpostUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/turposter/${encodeURIComponent(String(params.turpostId))}/${encodeURIComponent(checkinResult.id)}.json`
          promises.push(fetchFirebase(turpostUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: itemJson }))
        }
      }

      const visUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/checkins_visibility/${encodeURIComponent(checkinResult.id)}.json`
      promises.push(fetchFirebase(visUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(visibility) }))

      await Promise.all(promises)
    } catch (fbErr) {
      console.warn('[useAuth] Feil ved direkte lagring av innsjekking i Firebase:', fbErr)
    }
  }

  return checkinResult
}

// =============================================================================
// Slett offentlig innsjekk via Cloud Function og direkte i Firebase
// =============================================================================
async function deletePublicCheckin(params: {
  turpostId: string | number
  checkinId: string
  timestamp?: string
}): Promise<void> {
  if (!user.value || !isValidUserId(user.value.userId)) {
    throw new Error('Du må være innlogget med en gyldig bruker-ID for å slette en innsjekking.')
  }
  const cleanUserId = normalizeUserId(user.value.userId)

  const cleanCheckinId = (params.checkinId || '').trim()
  if (!cleanCheckinId || cleanCheckinId === 'undefined' || cleanCheckinId === 'null') {
    throw new Error('Ugyldig eller manglende checkinId for sletting.')
  }

  // 1. Send forespørsel til backend API for sletting i Regneark og Drive
  if (API_URL) {
    const payload = {
      action: 'delete_checkin',
      idToken: currentIdToken.value || undefined,
      userId: cleanUserId,
      turpostId: String(params.turpostId),
      checkinId: cleanCheckinId,
      timestamp: params.timestamp
    }

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        const text = await response.text()
        const data = JSON.parse(text)
        if (!data.success) {
          console.warn('[useAuth] API delete_checkin returnerte feil:', data.error)
        }
      }
    } catch (err) {
      console.warn('[useAuth] Feil ved sletting via API:', err)
    }
  }

  // 2. Synkroniser direkte sletting til Firebase RTDB for umiddelbar respons
  const fbConfig = await getFirebaseConfig()
  if (fbConfig && cleanCheckinId) {
    try {
      const turpostUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/turposter/${encodeURIComponent(String(params.turpostId))}/${encodeURIComponent(cleanCheckinId)}.json`
      const userFriendsUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(cleanUserId)}/friends_checkins/${encodeURIComponent(cleanCheckinId)}.json`
      const userPrivateUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(cleanUserId)}/private_checkins/${encodeURIComponent(cleanCheckinId)}.json`
      const userUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(cleanUserId)}/checkins/${encodeURIComponent(cleanCheckinId)}.json`
      const legacyUserUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(cleanUserId)}/${encodeURIComponent(cleanCheckinId)}.json`
      const visUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/checkins_visibility/${encodeURIComponent(cleanCheckinId)}.json`
      await Promise.all([
        fetchFirebase(turpostUrl, { method: 'DELETE' }),
        fetchFirebase(userFriendsUrl, { method: 'DELETE' }).catch(() => {}),
        fetchFirebase(userPrivateUrl, { method: 'DELETE' }).catch(() => {}),
        fetchFirebase(userUrl, { method: 'DELETE' }).catch(() => {}),
        fetchFirebase(legacyUserUrl, { method: 'DELETE' }).catch(() => {}),
        fetchFirebase(visUrl, { method: 'DELETE' }).catch(() => {})
      ])
    } catch (err) {
      console.warn('[useAuth] Feil ved direkte sletting i Firebase:', err)
    }
  }
}

// =============================================================================
// Oppdater offentlig innsjekking (beskrivelse og/eller bilde)
// =============================================================================
async function updatePublicCheckin(params: {
  turpostId: string | number
  checkinId: string
  timestamp?: string
  description?: string
  imageFile?: File | null
  removeImage?: boolean
  visibility?: 'all' | 'friends' | 'private'
  trackId?: string | null
}): Promise<{ imageUrl?: string; description?: string; visibility?: 'all' | 'friends' | 'private'; trackId?: string }> {
  if (!user.value || !isValidUserId(user.value.userId)) {
    throw new Error('Du må være innlogget med en gyldig bruker-ID for å oppdatere en innsjekking.')
  }
  const cleanUserId = normalizeUserId(user.value.userId)

  const cleanCheckinId = (params.checkinId || '').trim()
  if (!cleanCheckinId || cleanCheckinId === 'undefined' || cleanCheckinId === 'null') {
    throw new Error('Ugyldig eller manglende checkinId for oppdatering av innsjekking.')
  }

  let finalImageUrl: string | undefined = undefined

  if (API_URL) {
    let uploadedImageUrl: string | undefined = undefined
    let imagePayload: { base64: string; mimeType: string; fileName: string } | null = null

    if (params.imageFile) {
      const driveUploadUrl = getDriveUploadUrl()
      if (driveUploadUrl) {
        try {
          uploadedImageUrl = await uploadImageToDrive(
            params.imageFile,
            params.turpostId,
            currentIdToken.value || undefined
          )
        } catch (uploadErr: unknown) {
          console.warn('Bildeopplasting via Cloud Function feilet ved oppdatering, prøver fallback:', uploadErr)
          const base64 = await fileToBase64(params.imageFile)
          imagePayload = {
            base64,
            mimeType: params.imageFile.type || 'image/jpeg',
            fileName: params.imageFile.name || `innsjekk_${Date.now()}.jpg`
          }
        }
      } else {
        const base64 = await fileToBase64(params.imageFile)
        imagePayload = {
          base64,
          mimeType: params.imageFile.type || 'image/jpeg',
          fileName: params.imageFile.name || `innsjekk_${Date.now()}.jpg`
        }
      }
    }

    const payload = {
      action: 'update_checkin',
      idToken: currentIdToken.value || undefined,
      userId: cleanUserId,
      turpostId: String(params.turpostId),
      checkinId: cleanCheckinId,
      timestamp: params.timestamp,
      description: params.description,
      imageUrl: uploadedImageUrl,
      image: imagePayload,
      removeImage: params.removeImage,
      trackId: params.trackId !== undefined ? (params.trackId === null ? '' : params.trackId) : undefined
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 45_000)
    let response: Response
    try {
      response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
        signal: controller.signal
      })
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Nettverksforespørselen tok for lang tid (tidsavbrudd etter 45 sekunder). Sjekk internettforbindelsen og prøv igjen.')
      }
      throw err
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      throw new Error(`Tjeneren svarte med feilstatus ${response.status}`)
    }

    const text = await response.text()
    let data: Record<string, unknown>
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error('Ugyldig svar fra tjeneren (ikke JSON).')
    }

    if (!data.success) {
      throw new Error((data.error as string) || 'Oppdatering av innsjekking feilet.')
    }

    if (params.removeImage) {
      finalImageUrl = ''
    } else {
      finalImageUrl = (typeof data.imageUrl === 'string' && data.imageUrl) ? data.imageUrl : uploadedImageUrl
    }
  }

  // Synkroniser direkte til Firebase RTDB for å sikre umiddelbar oppdatering
  const fbConfig = await getFirebaseConfig()
  if (fbConfig && cleanCheckinId) {
    try {
      const patchData: Record<string, unknown> = {}
      if (params.description !== undefined) {
        patchData.description = params.description
      }
      if (params.removeImage) {
        patchData.imageUrl = ''
      } else if (finalImageUrl !== undefined) {
        patchData.imageUrl = finalImageUrl
      }
      if (params.visibility !== undefined) {
        patchData.visibility = params.visibility
      }
      if (params.trackId !== undefined) {
        patchData.trackId = params.trackId === null ? '' : params.trackId
      }

      if (Object.keys(patchData).length > 0) {
        const patchBody = JSON.stringify(patchData)
        const turpostUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/turposter/${encodeURIComponent(String(params.turpostId))}/${encodeURIComponent(cleanCheckinId)}.json`
        const friendsUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(cleanUserId)}/friends_checkins/${encodeURIComponent(cleanCheckinId)}.json`
        const privateUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(cleanUserId)}/private_checkins/${encodeURIComponent(cleanCheckinId)}.json`
        const legacyCheckinsUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(cleanUserId)}/checkins/${encodeURIComponent(cleanCheckinId)}.json`

        const promises: Promise<unknown>[] = []

        if (params.visibility === 'private') {
          // Flytt til private_checkins
          let itemToSave: FirebaseCheckinItem | null = null
          const r1 = await fetchFirebase(friendsUrl)
          if (r1.ok) itemToSave = (await r1.json()) as FirebaseCheckinItem | null
          if (!itemToSave) {
            const r2 = await fetchFirebase(legacyCheckinsUrl)
            if (r2.ok) itemToSave = (await r2.json()) as FirebaseCheckinItem | null
          }
          if (itemToSave) {
            itemToSave.userId = cleanUserId
            Object.assign(itemToSave, patchData)
            promises.push(fetchFirebase(privateUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(itemToSave) }))
          } else {
            promises.push(fetchFirebase(privateUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: patchBody }))
          }
          promises.push(fetchFirebase(turpostUrl, { method: 'DELETE' }).catch(() => {}))
          promises.push(fetchFirebase(friendsUrl, { method: 'DELETE' }).catch(() => {}))
          promises.push(fetchFirebase(legacyCheckinsUrl, { method: 'DELETE' }).catch(() => {}))
        } else if (params.visibility === 'friends') {
          // Flytt til friends_checkins, slett fra turpost og private_checkins
          let itemToSave: FirebaseCheckinItem | null = null
          const r1 = await fetchFirebase(privateUrl)
          if (r1.ok) itemToSave = (await r1.json()) as FirebaseCheckinItem | null
          if (!itemToSave) {
            const r2 = await fetchFirebase(legacyCheckinsUrl)
            if (r2.ok) itemToSave = (await r2.json()) as FirebaseCheckinItem | null
          }
          if (itemToSave) {
            itemToSave.userId = cleanUserId
            Object.assign(itemToSave, patchData)
            promises.push(fetchFirebase(friendsUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(itemToSave) }))
            promises.push(fetchFirebase(privateUrl, { method: 'DELETE' }).catch(() => {}))
          } else {
            promises.push(fetchFirebase(friendsUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: patchBody }))
          }
          promises.push(fetchFirebase(turpostUrl, { method: 'DELETE' }).catch(() => {}))
          promises.push(fetchFirebase(legacyCheckinsUrl, { method: 'DELETE' }).catch(() => {}))
        } else if (params.visibility === 'all') {
          // Flytt til friends_checkins og turposter, slett fra private_checkins
          let itemToSave: FirebaseCheckinItem | null = null
          const r1 = await fetchFirebase(privateUrl)
          if (r1.ok) itemToSave = (await r1.json()) as FirebaseCheckinItem | null
          if (!itemToSave) {
            const r2 = await fetchFirebase(legacyCheckinsUrl)
            if (r2.ok) itemToSave = (await r2.json()) as FirebaseCheckinItem | null
          }
          if (!itemToSave) {
            const r3 = await fetchFirebase(friendsUrl)
            if (r3.ok) itemToSave = (await r3.json()) as FirebaseCheckinItem | null
          }
          if (itemToSave) {
            itemToSave.userId = cleanUserId
            Object.assign(itemToSave, patchData)
            const jsonStr = JSON.stringify(itemToSave)
            promises.push(fetchFirebase(friendsUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: jsonStr }))
            promises.push(fetchFirebase(turpostUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: jsonStr }))
            promises.push(fetchFirebase(privateUrl, { method: 'DELETE' }).catch(() => {}))
          } else {
            promises.push(fetchFirebase(friendsUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: patchBody }))
            promises.push(fetchFirebase(turpostUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: patchBody }))
          }
          promises.push(fetchFirebase(legacyCheckinsUrl, { method: 'DELETE' }).catch(() => {}))
        } else {
          // Synlighet uendret: patch alle aktuelle noder
          promises.push(fetchFirebase(turpostUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: patchBody }).catch(() => {}))
          promises.push(fetchFirebase(friendsUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: patchBody }).catch(() => {}))
          promises.push(fetchFirebase(privateUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: patchBody }).catch(() => {}))
          promises.push(fetchFirebase(legacyCheckinsUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: patchBody }).catch(() => {}))
        }

        if (params.visibility !== undefined) {
          const visUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/checkins_visibility/${encodeURIComponent(cleanCheckinId)}.json`
          promises.push(fetchFirebase(visUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params.visibility) }))
        }
        await Promise.all(promises)
      }
    } catch (err) {
      console.warn('[useAuth] Feil ved direkte oppdatering i Firebase:', err)
    }
  }

  return {
    imageUrl: finalImageUrl,
    description: params.description,
    visibility: params.visibility,
    trackId: params.trackId !== undefined ? (params.trackId === null ? undefined : params.trackId) : undefined
  }
}

// =============================================================================
// Oppdater eller fjern bilde på en offentlig innsjekking
// =============================================================================
async function updatePublicCheckinImage(params: {
  turpostId: string | number
  checkinId: string
  timestamp?: string
  imageFile?: File | null
}): Promise<string> {
  const res = await updatePublicCheckin({
    turpostId: params.turpostId,
    checkinId: params.checkinId,
    timestamp: params.timestamp,
    imageFile: params.imageFile,
    removeImage: params.imageFile === null
  })
  return res.imageUrl || ''
}

// =============================================================================
// Hent fersk SystemKonfigurasjon fra Cloud Function hvis den mangler eller er utdatert
// =============================================================================
async function refreshSystemConfig(): Promise<SystemConfig> {
  if (!API_URL || !user.value) return systemConfig.value

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'getConfig',
        userId: user.value.userId,
        idToken: currentIdToken.value || undefined
      })
    })

    if (!response.ok) return systemConfig.value
    const data = await response.json()
    if (data.success && data.systemConfig) {
      systemConfig.value = data.systemConfig
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(data.systemConfig))
    }
  } catch (err) {
    console.warn('[useAuth] Kunne ikke oppdatere SystemKonfigurasjon:', err)
  }

  return systemConfig.value
}

// =============================================================================
// Hent innsjekkinger for en gitt turpost fra Firebase
// =============================================================================
async function fetchTurpostCheckins(turpostId: string | number): Promise<FirebaseCheckinItem[]> {
  let dbUrl = (systemConfig.value.FIREBASE_DB_URL || '').replace(/\/$/, '')
  let prefix = (systemConfig.value.FIREBASE_SECRET_PREFIX || '').replace(/^\/|\/$/g, '')

  // Hvis config mangler i minnet/localStorage, oppfrisk fra server
  if (!dbUrl || !prefix) {
    await refreshSystemConfig()
    dbUrl = (systemConfig.value.FIREBASE_DB_URL || '').replace(/\/$/, '')
    prefix = (systemConfig.value.FIREBASE_SECRET_PREFIX || '').replace(/^\/|\/$/g, '')
  }

  if (!dbUrl || !prefix) return []

  try {
    const url = `${dbUrl}/${prefix}/turposter/${encodeURIComponent(String(turpostId))}.json`
    const res = await fetchFirebase(url)
    if (!res.ok) return []
    const data = (await res.json()) as Record<string, unknown> | null
    if (!data || typeof data !== 'object') return []

    const list: FirebaseCheckinItem[] = []
    for (const [key, val] of Object.entries(data)) {
      if (!val || typeof val !== 'object') continue
      const item = val as Record<string, unknown>

      // Ignorer korrupte/spøkelsesnoder som mangler både timestamp og userId
      if (!item.timestamp && !item.userId) {
        console.warn(`[useAuth] Ignorerer korrupt/ufullstendig innsjekking for turpost ${turpostId} (nøkkel: ${key}):`, item)
        continue
      }

      const cleanUid = normalizeUserId(item.userId)
      if (!cleanUid) {
        console.warn(`[useAuth] Ignorerer innsjekking med ugyldig/korrupt userId for turpost ${turpostId} (nøkkel: ${key}):`, item)
        continue
      }
      item.userId = cleanUid

      if (!item.id || item.id === 'undefined') {
        item.id = key
      }
      list.push(item as unknown as FirebaseCheckinItem)
    }

    return list
  } catch (err) {
    console.warn('[useAuth] Kunne ikke hente turpost-innsjekkinger fra Firebase:', err)
    return []
  }
}

const RESERVED_USER_SUBKEYS = new Set([
  'checkins',
  'my_spots',
  'my_spots_checkins',
  'tracks',
  'friends',
  'friend_requests',
  'settings'
])

export const migratedUsersCache = new Set<string>()

export async function migrateUserCheckinsIfNeeded(userId: string, dbUrl: string, prefix: string): Promise<void> {
  if (!userId || migratedUsersCache.has(userId)) return

  const storageKey = `tortur_migrated_checkins_${userId}`
  if (localStorage.getItem(storageKey) === 'true') {
    migratedUsersCache.add(userId)
    return
  }

  try {
    const userRootUrl = `${dbUrl}/${prefix}/brukere/${encodeURIComponent(userId)}.json`
    const res = await fetchFirebase(userRootUrl)
    if (!res.ok) {
      // 401/403: Firebase-reglene tillater ikke lesing av hele brukernoden (kun barna).
      // Dette betyr at auth_uid-mappingen eksisterer og brukeren allerede er migrert.
      localStorage.setItem(storageKey, 'true')
      migratedUsersCache.add(userId)
      return
    }
    const data = await res.json()
    if (!data || typeof data !== 'object') {
      localStorage.setItem(storageKey, 'true')
      migratedUsersCache.add(userId)
      return
    }

    const legacyCheckins: { key: string; checkin: FirebaseCheckinItem }[] = []
    for (const [key, val] of Object.entries(data)) {
      if (RESERVED_USER_SUBKEYS.has(key)) continue
      if (val && typeof val === 'object' && 'turpostId' in val && (val as { turpostId: unknown }).turpostId != null) {
        legacyCheckins.push({ key, checkin: val as FirebaseCheckinItem })
      }
    }

    if (legacyCheckins.length > 0) {
      await Promise.all(
        legacyCheckins.map(async ({ key, checkin }) => {
          const chkId = checkin.id || key
          const newUrl = `${dbUrl}/${prefix}/brukere/${encodeURIComponent(userId)}/checkins/${encodeURIComponent(chkId)}.json`
          await fetchFirebase(newUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(checkin)
          })
          const oldUrl = `${dbUrl}/${prefix}/brukere/${encodeURIComponent(userId)}/${encodeURIComponent(key)}.json`
          await fetchFirebase(oldUrl, { method: 'DELETE' }).catch(() => {})
        })
      )
    }

    localStorage.setItem(storageKey, 'true')
    migratedUsersCache.add(userId)
  } catch (err) {
    console.warn('[useAuth] Feil under migrering av innsjekkinger:', err)
  }
}

// =============================================================================
// Hent innlogget brukers egne innsjekkinger fra Firebase ("Mine innsjekkinger")
// =============================================================================
async function fetchMyCheckins(): Promise<FirebaseCheckinItem[]> {
  if (!user.value) return []
  let dbUrl = (systemConfig.value.FIREBASE_DB_URL || '').replace(/\/$/, '')
  let prefix = (systemConfig.value.FIREBASE_SECRET_PREFIX || '').replace(/^\/|\/$/g, '')

  // Hvis config mangler i minnet/localStorage, oppfrisk fra server
  if (!dbUrl || !prefix) {
    await refreshSystemConfig()
    dbUrl = (systemConfig.value.FIREBASE_DB_URL || '').replace(/\/$/, '')
    prefix = (systemConfig.value.FIREBASE_SECRET_PREFIX || '').replace(/^\/|\/$/g, '')
  }

  if (!dbUrl || !prefix) return []

  try {
    // 1. Automatisk migrering hvis det finnes eldre innsjekkinger direkte under bruker-ID
    await migrateUserCheckinsIfNeeded(user.value.userId, dbUrl, prefix)

    const checkinMap = new Map<string, FirebaseCheckinItem>()
    const uId = user.value.userId

    // 2. Hent friends_checkins (delte innsjekkinger for venner og alle)
    const friendsUrl = `${dbUrl}/${prefix}/brukere/${encodeURIComponent(uId)}/friends_checkins.json`
    const { data: friendsData } = await cachedFetchJson<Record<string, unknown>>(friendsUrl, {
      userId: uId,
      freshMs: 30_000,
    })
    if (friendsData && typeof friendsData === 'object') {
      for (const [key, val] of Object.entries(friendsData)) {
        const item = val as Record<string, unknown> | null
        if (!item || typeof item !== 'object' || item.turpostId == null) continue
        if (!item.id) item.id = key
        item.userId = uId
        if (!item.userName) item.userName = user.value.userName
        const chkItem = item as unknown as FirebaseCheckinItem

        // Hvis det feilaktig lå en private-innsjekking her, flytt den automatisk:
        if (chkItem.visibility === 'private') {
          chkItem.userId = uId
          fetchFirebase(`${dbUrl}/${prefix}/brukere/${encodeURIComponent(uId)}/private_checkins/${encodeURIComponent(chkItem.id)}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chkItem)
          }).catch(() => {})
          fetchFirebase(`${dbUrl}/${prefix}/brukere/${encodeURIComponent(uId)}/friends_checkins/${encodeURIComponent(chkItem.id)}.json`, { method: 'DELETE' }).catch(() => {})
          fetchFirebase(`${dbUrl}/${prefix}/turposter/${encodeURIComponent(String(chkItem.turpostId))}/${encodeURIComponent(chkItem.id)}.json`, { method: 'DELETE' }).catch(() => {})
        }
        checkinMap.set(chkItem.id, chkItem)
      }
    }

    // 3. Hent private_checkins (kun meg)
    const privUrl = `${dbUrl}/${prefix}/brukere/${encodeURIComponent(uId)}/private_checkins.json`
    const { data: privData } = await cachedFetchJson<Record<string, unknown>>(privUrl, {
      userId: uId,
      freshMs: 30_000,
    })
    if (privData && typeof privData === 'object') {
      for (const [key, val] of Object.entries(privData)) {
        const item = val as Record<string, unknown> | null
        if (!item || typeof item !== 'object' || item.turpostId == null) continue
        if (!item.id) item.id = key
        item.userId = uId
        if (!item.userName) item.userName = user.value.userName
        const chkItem = { ...(item as unknown as FirebaseCheckinItem), visibility: 'private' as const, userId: uId }
        checkinMap.set(chkItem.id, chkItem)
      }
    }

    // 4. Hent legacy checkins og migrer dem automatisk
    const legacyUrl = `${dbUrl}/${prefix}/brukere/${encodeURIComponent(uId)}/checkins.json`
    const legacyRes = await fetchFirebase(legacyUrl)
    if (legacyRes.ok) {
      const legacyData = await legacyRes.json()
      if (legacyData && typeof legacyData === 'object') {
        for (const [key, val] of Object.entries(legacyData)) {
          const item = val as Record<string, unknown> | null
          if (!item || typeof item !== 'object' || item.turpostId == null) continue
          if (!item.id) item.id = key
          item.userId = uId
          if (!item.userName) item.userName = user.value.userName

          if (String(item.turpostId).startsWith('spot_')) {
            fetchFirebase(`${dbUrl}/${prefix}/brukere/${encodeURIComponent(uId)}/checkins/${encodeURIComponent(String(item.id))}.json`, { method: 'DELETE' }).catch(() => {})
            fetchFirebase(`${dbUrl}/${prefix}/turposter/${encodeURIComponent(String(item.turpostId))}/${encodeURIComponent(String(item.id))}.json`, { method: 'DELETE' }).catch(() => {})
            continue
          }

          const chkItem = item as unknown as FirebaseCheckinItem
          if (chkItem.visibility === 'private') {
            fetchFirebase(`${dbUrl}/${prefix}/brukere/${encodeURIComponent(uId)}/private_checkins/${encodeURIComponent(chkItem.id)}.json`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(chkItem)
            }).catch(() => {})
            fetchFirebase(`${dbUrl}/${prefix}/turposter/${encodeURIComponent(String(chkItem.turpostId))}/${encodeURIComponent(chkItem.id)}.json`, { method: 'DELETE' }).catch(() => {})
          } else {
            fetchFirebase(`${dbUrl}/${prefix}/brukere/${encodeURIComponent(uId)}/friends_checkins/${encodeURIComponent(chkItem.id)}.json`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(chkItem)
            }).catch(() => {})
            if (chkItem.visibility === 'friends') {
              fetchFirebase(`${dbUrl}/${prefix}/turposter/${encodeURIComponent(String(chkItem.turpostId))}/${encodeURIComponent(chkItem.id)}.json`, { method: 'DELETE' }).catch(() => {})
            }
          }
          fetchFirebase(`${dbUrl}/${prefix}/brukere/${encodeURIComponent(uId)}/checkins/${encodeURIComponent(chkItem.id)}.json`, { method: 'DELETE' }).catch(() => {})
          checkinMap.set(chkItem.id, chkItem)
        }
      }
    }

    const checkins = Array.from(checkinMap.values())

    // Hent eventuelle oppdaterte likes og kommentarer fra turpost-noden for offentlige turer
    await Promise.all(
      checkins.map(async (item) => {
        if (!item.turpostId || item.isPrivate || item.visibility === 'private') return
        try {
          const tpUrl = `${dbUrl}/${prefix}/turposter/${encodeURIComponent(String(item.turpostId))}/${encodeURIComponent(item.id)}.json`
          const tpRes = await fetchFirebase(tpUrl)
          if (tpRes.ok) {
            const tpData = await tpRes.json()
            if (tpData && typeof tpData === 'object') {
              if (tpData.likes) item.likes = { ...(item.likes || {}), ...tpData.likes }
              if (tpData.comments) item.comments = { ...(item.comments || {}), ...tpData.comments }
              if (!item.turpostName && tpData.turpostName) item.turpostName = tpData.turpostName
            }
          }
        } catch {}
      })
    )

    return checkins
  } catch (err) {
    console.warn('[useAuth] Kunne ikke hente bruker-innsjekkinger fra Firebase:', err)
    return []
  }
}

// =============================================================================
// getFirebaseConfig – hjelpefunksjon for moduler som trenger Firebase-tilkobling
// =============================================================================
export async function getFirebaseConfig(): Promise<{ dbUrl: string; prefix: string } | null> {
  let dbUrl = (systemConfig.value.FIREBASE_DB_URL || '').replace(/\/$/, '')
  let prefix = (systemConfig.value.FIREBASE_SECRET_PREFIX || '').replace(/^\/|\/$/g, '')

  if (!dbUrl || !prefix) {
    await refreshSystemConfig()
    dbUrl = (systemConfig.value.FIREBASE_DB_URL || '').replace(/\/$/, '')
    prefix = (systemConfig.value.FIREBASE_SECRET_PREFIX || '').replace(/^\/|\/$/g, '')
  }

  if (!dbUrl || !prefix) return null
  return { dbUrl, prefix }
}

// =============================================================================
// useAuth – composable eksport
// =============================================================================
export function useAuth() {
  const isLoggedIn = computed(() => !!user.value)
  const isAdmin    = computed(() => user.value?.isAdmin === true)

  const aisClientId     = computed(() => systemConfig.value.AIS_CLIENT_ID     || '')
  const aisClientSecret = computed(() => systemConfig.value.AIS_CLIENT_SECRET || '')
  const firebaseDbUrl   = computed(() => systemConfig.value.FIREBASE_DB_URL   || '')
  const mapboxToken     = computed(() => {
    if (!user.value?.isAdmin) return ''
    return systemConfig.value.MAPBOX_TOKEN || ''
  })

  return {
    user,
    isLoggedIn,
    isAdmin,
    isLoading,
    error,
    systemConfig,
    aisClientId,
    aisClientSecret,
    firebaseDbUrl,
    mapboxToken,
    login,
    logout,
    submitCheckin,
    deletePublicCheckin,
    updatePublicCheckin,
    updatePublicCheckinImage,
    fetchTurpostCheckins,
    fetchMyCheckins,
    getFirebaseConfig
  }
}
