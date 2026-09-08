import { ref, computed } from 'vue'

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
}

export interface CheckinResult {
  userId: string
  turpostId: string
  turpostName?: string
  timestamp: string
  description: string
  imageUrl: string
  userName?: string
  userAvatar?: string
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
}

const STORAGE_KEY_USER   = 'tortur_user'
const STORAGE_KEY_CONFIG = 'tortur_system_config'
const STORAGE_KEY_TOKEN  = 'tortur_id_token'

const APPSCRIPT_URL = import.meta.env.VITE_APPSCRIPT_URL as string | undefined
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
  if (savedToken) currentIdToken.value = savedToken
} catch {
  // Ugyldig data – ignorer
}

// =============================================================================
// Last Google Identity Services SDK dynamisk
// =============================================================================
function loadGIS(): Promise<void> {
  if (gisLoaded || (window as any).google?.accounts?.id) {
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
  if (!APPSCRIPT_URL) {
    error.value = 'VITE_APPSCRIPT_URL er ikke konfigurert i .env'
    return
  }

  isLoading.value = true
  error.value = null

  try {
    // NB: 'application/json' trigger CORS preflight som Apps Script ikke støtter.
    // 'text/plain' er en "simple request" og unngår preflight.
    const response = await fetch(APPSCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'login', idToken })
    })

    // Sjekk HTTP-statuskode før vi prøver å parse JSON
    if (!response.ok) {
      error.value = `Apps Script svarte med HTTP ${response.status}. Sjekk at deployment-URL i .env er oppdatert.`
      return
    }

    // Defensiv JSON-parsing – Apps Script kan returnere HTML ved feilkonfig
    const text = await response.text()
    let data: Record<string, unknown>
    try {
      data = JSON.parse(text)
    } catch {
      console.error('[useAuth] Ugyldig JSON fra Apps Script:', text.slice(0, 200))
      error.value = 'Apps Script returnerte ugyldig svar (ikke JSON). Deployment-URL er sannsynligvis utdatert.'
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
    const google = (window as any).google
    if (!google?.accounts?.id) {
      error.value = 'Google Identity Services er ikke tilgjengelig'
      return
    }

    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response: any) => {
        if (response.credential) {
          loginWithToken(response.credential)
        } else {
          error.value = 'Ingen legitimasjon mottatt fra Google'
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true
    })

    google.accounts.id.prompt((notification: any) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        google.accounts.id.renderButton(
          document.getElementById('g_id_signin_hidden') || document.body,
          { theme: 'outline', size: 'large' }
        )
      }
    })
  } catch (e: any) {
    error.value = e?.message || 'Innlogging feilet'
  }
}

// =============================================================================
// Logg ut
// =============================================================================
function logout(): void {
  user.value           = null
  systemConfig.value   = {}
  currentIdToken.value = null
  error.value          = null
  localStorage.removeItem(STORAGE_KEY_USER)
  localStorage.removeItem(STORAGE_KEY_CONFIG)
  sessionStorage.removeItem(STORAGE_KEY_TOKEN)

  try {
    const google = (window as any).google
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
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = err => reject(err)
    reader.readAsDataURL(file)
  })
}

// =============================================================================
// Send innsjekk til Google Apps Script
// =============================================================================
async function submitCheckin(params: CheckinParams): Promise<CheckinResult> {
  if (!APPSCRIPT_URL) {
    throw new Error('VITE_APPSCRIPT_URL er ikke konfigurert i miljøvariabler.')
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
    image: imagePayload
  }

  const response = await fetch(APPSCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    throw new Error(`Tjeneren svarte med feilstatus ${response.status}`)
  }

  const text = await response.text()
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Ugyldig svar fra tjeneren (ikke JSON).')
  }

  if (!data.success) {
    throw new Error(data.error || 'Innsjekking feilet.')
  }

  if (data.systemConfig) {
    systemConfig.value = data.systemConfig
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(data.systemConfig))
  }

  return data.checkin as CheckinResult
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

  // 1. Send forespørsel til Google Apps Script for sletting i Regneark og Drive
  if (APPSCRIPT_URL) {
    const payload = {
      action: 'delete_checkin',
      idToken: currentIdToken.value || undefined,
      userId: user.value.userId,
      turpostId: String(params.turpostId),
      checkinId: params.checkinId,
      timestamp: params.timestamp
    }

    try {
      const response = await fetch(APPSCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        const text = await response.text()
        const data = JSON.parse(text)
        if (!data.success) {
          console.warn('[useAuth] Apps Script delete_checkin returnerte feil:', data.error)
        }
      }
    } catch (err) {
      console.warn('[useAuth] Feil ved sletting via Apps Script:', err)
    }
  }

  // 2. Synkroniser direkte sletting til Firebase RTDB for umiddelbar respons
  const fbConfig = await getFirebaseConfig()
  if (fbConfig && params.checkinId) {
    try {
      const turpostUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/turposter/${encodeURIComponent(String(params.turpostId))}/${encodeURIComponent(params.checkinId)}.json`
      const userUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(user.value.userId)}/${encodeURIComponent(params.checkinId)}.json`
      await Promise.all([
        fetch(turpostUrl, { method: 'DELETE' }),
        fetch(userUrl, { method: 'DELETE' })
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
}): Promise<{ imageUrl?: string; description?: string }> {
  if (!user.value) {
    throw new Error('Du må være innlogget for å oppdatere en innsjekking.')
  }

  let finalImageUrl: string | undefined = undefined

  if (APPSCRIPT_URL) {
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
      removeImage: params.removeImage
    }

    const response = await fetch(APPSCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`Tjeneren svarte med feilstatus ${response.status}`)
    }

    const text = await response.text()
    let data: any
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error('Ugyldig svar fra tjeneren (ikke JSON).')
    }

    if (!data.success) {
      throw new Error(data.error || 'Oppdatering av innsjekking feilet.')
    }

    finalImageUrl = data.imageUrl
  }

  // Synkroniser direkte til Firebase RTDB for å sikre umiddelbar oppdatering
  const fbConfig = await getFirebaseConfig()
  if (fbConfig && params.checkinId) {
    try {
      const patchData: Record<string, any> = {}
      if (params.description !== undefined) {
        patchData.description = params.description
      }
      if (params.removeImage) {
        patchData.imageUrl = ''
      } else if (finalImageUrl !== undefined) {
        patchData.imageUrl = finalImageUrl
      }

      if (Object.keys(patchData).length > 0) {
        const patchBody = JSON.stringify(patchData)
        const turpostUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/turposter/${encodeURIComponent(String(params.turpostId))}/${encodeURIComponent(params.checkinId)}.json`
        const userUrl = `${fbConfig.dbUrl}/${fbConfig.prefix}/brukere/${encodeURIComponent(user.value.userId)}/${encodeURIComponent(params.checkinId)}.json`
        await Promise.all([
          fetch(turpostUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: patchBody }),
          fetch(userUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: patchBody })
        ])
      }
    } catch (err) {
      console.warn('[useAuth] Feil ved direkte oppdatering i Firebase:', err)
    }
  }

  return { imageUrl: finalImageUrl, description: params.description }
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
  if (!APPSCRIPT_URL || !user.value) return systemConfig.value

  try {
    const response = await fetch(APPSCRIPT_URL, {
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
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    if (!data || typeof data !== 'object') return []
    return Object.values(data) as FirebaseCheckinItem[]
  } catch (err) {
    console.warn('[useAuth] Kunne ikke hente turpost-innsjekkinger fra Firebase:', err)
    return []
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
    const url = `${dbUrl}/${prefix}/brukere/${encodeURIComponent(user.value.userId)}.json`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    if (!data || typeof data !== 'object') return []
    // Filtrer ut eventuelle undernoder som ikke er innsjekkinger (f.eks. 'tracks')
    return (Object.values(data) as any[]).filter(
      (item) => item && typeof item === 'object' && item.turpostId != null
    ) as FirebaseCheckinItem[]
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
