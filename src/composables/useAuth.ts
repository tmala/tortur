import { ref, computed } from 'vue'

export interface GoogleUser {
  userId: string
  userName: string
  email: string
  avatarUrl: string
  lastLogin: string
}

export interface SystemConfig {
  AIS_CLIENT_ID?: string
  AIS_CLIENT_SECRET?: string
  [key: string]: string | undefined
}

const STORAGE_KEY_USER   = 'tortur_user'
const STORAGE_KEY_CONFIG = 'tortur_system_config'

const APPSCRIPT_URL = import.meta.env.VITE_APPSCRIPT_URL as string | undefined
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

// Singleton state – delt på tvers av alle useAuth()-kall
const user         = ref<GoogleUser | null>(null)
const systemConfig = ref<SystemConfig>({})
const isLoading    = ref(false)
const error        = ref<string | null>(null)
let   gisLoaded    = false

// Gjenopprett fra localStorage ved første import
try {
  const savedUser = localStorage.getItem(STORAGE_KEY_USER)
  if (savedUser) user.value = JSON.parse(savedUser)

  const savedConfig = localStorage.getItem(STORAGE_KEY_CONFIG)
  if (savedConfig) systemConfig.value = JSON.parse(savedConfig)
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

    localStorage.setItem(STORAGE_KEY_USER,   JSON.stringify(user.value))
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(systemConfig.value))
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

  error.value = null

  try {
    await loadGIS()

    const google = (window as any).google

    await new Promise<void>((resolve, reject) => {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response: { credential: string }) => {
          try {
            await loginWithToken(response.credential)
            resolve()
          } catch (e) {
            reject(e)
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true
      })

      google.accounts.id.prompt((notification: any) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // One Tap ikke vist – prøv popup-flyt
          google.accounts.id.renderButton(
            document.getElementById('google-signin-btn'),
            { theme: 'outline', size: 'large', width: 280 }
          )
        }
        if (notification.isDismissedMoment()) {
          resolve() // bruker lukket – ikke en feil
        }
      })
    })
  } catch (e: any) {
    error.value = e?.message || 'Innlogging feilet'
  }
}

// =============================================================================
// Logg ut
// =============================================================================
function logout(): void {
  user.value         = null
  systemConfig.value = {}
  error.value        = null
  localStorage.removeItem(STORAGE_KEY_USER)
  localStorage.removeItem(STORAGE_KEY_CONFIG)

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
// useAuth – composable eksport
// =============================================================================
export function useAuth() {
  const isLoggedIn = computed(() => !!user.value)

  const aisClientId     = computed(() => systemConfig.value.AIS_CLIENT_ID     || '')
  const aisClientSecret = computed(() => systemConfig.value.AIS_CLIENT_SECRET || '')

  return {
    user,
    isLoggedIn,
    isLoading,
    error,
    systemConfig,
    aisClientId,
    aisClientSecret,
    login,
    logout
  }
}
