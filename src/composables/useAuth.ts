import { ref, computed } from 'vue'
import { signInWithGoogleIdToken, signOutFirebase, fetchFirebase, getFirebaseIdToken } from '@/services/firebase'

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
  if (savedUser) user.value = JSON.parse(savedUser)

  const savedConfig = localStorage.getItem(STORAGE_KEY_CONFIG)
  if (savedConfig) systemConfig.value = JSON.parse(savedConfig)

  const savedToken = sessionStorage.getItem(STORAGE_KEY_TOKEN)
  if (savedToken) {
    currentIdToken.value = savedToken
    signInWithGoogleIdToken(savedToken).then((fbCred) => {
      if (fbCred?.user?.uid && user.value?.userId) {
        syncAuthUid(user.value.userId, fbCred.user.uid).catch(() => {})
      }
    }).catch(() => {})
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
// Send id_token til Apps Script og valider whitelist
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

    user.value         = data.user as GoogleUser
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
      }
    } catch (fbAuthErr) {
      console.warn('[useAuth] Firebase Auth innlogging feilet (fortsetter med Apps Script sesjon):', fbAuthErr)
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

    gisId.prompt((notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        gisId.renderButton(
          document.getElementById('g_id_signin_hidden') || document.body,
          { theme: 'outline', size: 'large' }
        )
      }
    })
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
async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 32768 // 32 KB bolker for å unngå call stack- og minnebegrensninger
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return 'data:' + (file.type || 'image/jpeg') + ';base64,' + btoa(binary)
}

// =============================================================================
// Send innsjekk til Google Apps Script
// =============================================================================
async function submitCheckin(params: CheckinParams): Promise<CheckinResult> {
  if (!API_URL) {
    throw new Error('VITE_API_URL er ikke konfigurert i miljøvariabler.')
  }
  if (!user.value) {
    throw new Error('Du må være innlogget for å sjekke inn.')
  }

  let imagePayload: { base64: string; mimeType: string; fileName: string } | undefined
  if (params.imageFile) {
    const base64 = await fileToBase64(params.imageFile)
    imagePayload = {
      base64,
      mimeType: params.imageFile.type || 'image/jpeg',
      fileName: params.imageFile.name || `innsjekk_${Date.now()}.jpg`
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
    image: imagePayload,
    trackId: params.trackId || undefined
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  })

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

  // Synkroniser innsjekkingen direkte til Firebase Realtime Database fra webappen
  const fbConfig = await getFirebaseConfig()
  if (fbConfig && checkinResult.id && user.value) {
    try {
      const visibility = params.visibility || checkinResult.visibility || 'all'
      checkinResult.visibility = visibility
      const firebaseItem: FirebaseCheckinItem = {
        id: checkinResult.id,
        userId: user.value.userId,
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
        const privateUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(user.value.userId)}/private_checkins/${encodeURIComponent(checkinResult.id)}.json`
        promises.push(fetchFirebase(privateUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: itemJson }))
      } else {
        const friendsUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(user.value.userId)}/friends_checkins/${encodeURIComponent(checkinResult.id)}.json`
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
// Slett offentlig innsjekk via Apps Script og direkte i Firebase
// =============================================================================
async function deletePublicCheckin(params: {
  turpostId: string | number
  checkinId: string
  timestamp?: string
}): Promise<void> {
  if (!user.value) {
    throw new Error('Du må være innlogget for å slette en innsjekking.')
  }

  // 1. Send forespørsel til backend API for sletting i Regneark og Drive
  if (API_URL) {
    const payload = {
      action: 'delete_checkin',
      idToken: currentIdToken.value || undefined,
      userId: user.value.userId,
      turpostId: String(params.turpostId),
      checkinId: params.checkinId,
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
  if (fbConfig && params.checkinId) {
    try {
      const turpostUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/turposter/${encodeURIComponent(String(params.turpostId))}/${encodeURIComponent(params.checkinId)}.json`
      const userFriendsUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(user.value.userId)}/friends_checkins/${encodeURIComponent(params.checkinId)}.json`
      const userPrivateUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(user.value.userId)}/private_checkins/${encodeURIComponent(params.checkinId)}.json`
      const userUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(user.value.userId)}/checkins/${encodeURIComponent(params.checkinId)}.json`
      const legacyUserUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(user.value.userId)}/${encodeURIComponent(params.checkinId)}.json`
      const visUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/checkins_visibility/${encodeURIComponent(params.checkinId)}.json`
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
  if (!user.value) {
    throw new Error('Du må være innlogget for å oppdatere en innsjekking.')
  }

  let finalImageUrl: string | undefined = undefined

  if (API_URL) {
    let imagePayload: { base64: string; mimeType: string; fileName: string } | null = null
    if (params.imageFile) {
      const base64 = await fileToBase64(params.imageFile)
      imagePayload = {
        base64,
        mimeType: params.imageFile.type || 'image/jpeg',
        fileName: params.imageFile.name || `innsjekk_${Date.now()}.jpg`
      }
    }

    const payload = {
      action: 'update_checkin',
      idToken: currentIdToken.value || undefined,
      userId: user.value.userId,
      turpostId: String(params.turpostId),
      checkinId: params.checkinId,
      timestamp: params.timestamp,
      description: params.description,
      image: imagePayload,
      removeImage: params.removeImage,
      trackId: params.trackId !== undefined ? (params.trackId === null ? '' : params.trackId) : undefined
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    })

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
      finalImageUrl = typeof data.imageUrl === 'string' ? data.imageUrl : undefined
    }
  }

  // Synkroniser direkte til Firebase RTDB for å sikre umiddelbar oppdatering
  const fbConfig = await getFirebaseConfig()
  if (fbConfig && params.checkinId) {
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
        const turpostUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/turposter/${encodeURIComponent(String(params.turpostId))}/${encodeURIComponent(params.checkinId)}.json`
        const friendsUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(user.value.userId)}/friends_checkins/${encodeURIComponent(params.checkinId)}.json`
        const privateUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(user.value.userId)}/private_checkins/${encodeURIComponent(params.checkinId)}.json`
        const legacyCheckinsUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(user.value.userId)}/checkins/${encodeURIComponent(params.checkinId)}.json`

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
          if (itemToSave) {
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
          const visUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/checkins_visibility/${encodeURIComponent(params.checkinId)}.json`
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
// Hent fersk SystemKonfigurasjon fra Apps Script hvis den mangler eller er utdatert
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
    const data = await res.json()
    if (!data || typeof data !== 'object') return []
    return Object.values(data) as FirebaseCheckinItem[]
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
    if (!res.ok) return
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
    const friendsRes = await fetchFirebase(friendsUrl)
    if (friendsRes.ok) {
      const friendsData = await friendsRes.json()
      if (friendsData && typeof friendsData === 'object') {
        for (const [key, val] of Object.entries(friendsData)) {
          const item = val as Record<string, unknown> | null
          if (!item || typeof item !== 'object' || item.turpostId == null) continue
          if (!item.id) item.id = key
          if (!item.userId) item.userId = uId
          if (!item.userName) item.userName = user.value.userName
          const chkItem = item as unknown as FirebaseCheckinItem

          // Hvis det feilaktig lå en private-innsjekking her, flytt den automatisk:
          if (chkItem.visibility === 'private') {
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
    }

    // 3. Hent private_checkins (kun meg)
    const privUrl = `${dbUrl}/${prefix}/brukere/${encodeURIComponent(uId)}/private_checkins.json`
    const privRes = await fetchFirebase(privUrl)
    if (privRes.ok) {
      const privData = await privRes.json()
      if (privData && typeof privData === 'object') {
        for (const [key, val] of Object.entries(privData)) {
          const item = val as Record<string, unknown> | null
          if (!item || typeof item !== 'object' || item.turpostId == null) continue
          if (!item.id) item.id = key
          if (!item.userId) item.userId = uId
          if (!item.userName) item.userName = user.value.userName
          const chkItem = { ...(item as unknown as FirebaseCheckinItem), visibility: 'private' as const }
          checkinMap.set(chkItem.id, chkItem)
        }
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
          if (!item.userId) item.userId = uId
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
