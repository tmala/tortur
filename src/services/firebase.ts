import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signOut as fbSignOut,
  onAuthStateChanged,
  type Auth,
  type User as FirebaseUser,
  type UserCredential,
} from 'firebase/auth'
import {
  getDatabase,
  ref as dbRef,
  set,
  get,
  update,
  remove,
  type Database,
  type DatabaseReference,
} from 'firebase/database'

export interface FirebaseConfigOptions {
  apiKey?: string
  authDomain?: string
  projectId?: string
  databaseURL?: string
  appId?: string
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let database: Database | null = null

export function getFirebaseOptions(): FirebaseConfigOptions {
  let savedConfig: Record<string, string> = {}
  try {
    const raw = localStorage.getItem('tortur_system_config')
    if (raw) savedConfig = JSON.parse(raw)
  } catch {}

  const apiKey = (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) || savedConfig.FIREBASE_API_KEY
  const projectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) || savedConfig.FIREBASE_PROJECT_ID
  const authDomain =
    (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ||
    savedConfig.FIREBASE_AUTH_DOMAIN ||
    (projectId ? `${projectId}.firebaseapp.com` : undefined)
  const databaseURL =
    (import.meta.env.VITE_FIREBASE_DB_URL as string | undefined) ||
    savedConfig.FIREBASE_DB_URL ||
    undefined
  const appId = (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) || savedConfig.FIREBASE_APP_ID

  return { apiKey, authDomain, projectId, databaseURL, appId }
}

export function isFirebaseConfigured(): boolean {
  const opts = getFirebaseOptions()
  return Boolean(opts.apiKey && opts.projectId)
}

export function getFirebaseApp(): FirebaseApp | null {
  if (app) return app
  const opts = getFirebaseOptions()
  if (!opts.apiKey || !opts.projectId) {
    console.warn('[Firebase] FIREBASE_API_KEY eller FIREBASE_PROJECT_ID mangler (sjekk SystemKonfigurasjon i regnearket eller .env)')
    return null
  }

  if (getApps().length > 0) {
    app = getApp()
  } else {
    app = initializeApp({
      apiKey: opts.apiKey,
      authDomain: opts.authDomain,
      projectId: opts.projectId,
      databaseURL: opts.databaseURL,
      appId: opts.appId,
    })
  }
  return app
}

export function getFirebaseAuth(): Auth | null {
  if (auth) return auth
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) return null
  auth = getAuth(firebaseApp)
  return auth
}

export function getFirebaseDatabase(customDbUrl?: string): Database | null {
  if (database && !customDbUrl) return database
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) return null
  const opts = getFirebaseOptions()
  const url = customDbUrl || opts.databaseURL
  database = url ? getDatabase(firebaseApp, url) : getDatabase(firebaseApp)
  return database
}

/**
 * Sjekker om et JWT-token (f.eks. Google ID-token eller Firebase ID-token) er utløpt.
 * Returnerer true dersom tokenet mangler, er ugyldig eller har utløpt (med 30s sikkerhetsmargin).
 */
export function isJwtExpired(token?: string | null): boolean {
  if (!token || typeof token !== 'string') return true
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return true
    const payloadPart = parts[1]
    if (!payloadPart) return true
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const jsonStr = atob(padded)
    const payload = JSON.parse(jsonStr) as { exp?: number }
    if (typeof payload.exp !== 'number') return false
    return Date.now() >= payload.exp * 1000 - 30000
  } catch {
    return true
  }
}

let signInPromise: Promise<UserCredential | null> | null = null

/**
 * Logger inn i Firebase Auth ved hjelp av et Google ID-token (JWT) fra GIS
 */
export async function signInWithGoogleIdToken(idToken: string): Promise<UserCredential | null> {
  const authInstance = getFirebaseAuth()
  if (!authInstance) {
    console.warn('[Firebase] Auth er ikke konfigurert. Kan ikke logge inn mot Firebase.')
    return null
  }
  if (isJwtExpired(idToken)) {
    console.warn('[Firebase] Google ID-token er utløpt. Avbryter innlogging mot Firebase med utløpt token.')
    return null
  }
  const credential = GoogleAuthProvider.credential(idToken)
  signInPromise = signInWithCredential(authInstance, credential)
  try {
    const res = await signInPromise
    if (res?.user) {
      const fbToken = await res.user.getIdToken()
      sessionStorage.setItem('tortur_firebase_token', fbToken)
    }
    return res
  } catch (err) {
    console.warn('[Firebase] Feil ved signInWithCredential:', err)
    return null
  } finally {
    signInPromise = null
  }
}

/**
 * Logger ut fra Firebase Auth
 */
export async function signOutFirebase(): Promise<void> {
  sessionStorage.removeItem('tortur_firebase_token')
  const authInstance = getFirebaseAuth()
  if (!authInstance) return
  await fbSignOut(authInstance)
}

/**
 * Returnerer gjeldende innlogget Firebase-bruker
 */
export function getCurrentFirebaseUser(): FirebaseUser | null {
  const authInstance = getFirebaseAuth()
  return authInstance?.currentUser || null
}

/**
 * Lytter på endringer i Firebase Auth tilstand
 */
export function onFirebaseAuthStateChange(callback: (user: FirebaseUser | null) => void): () => void {
  const authInstance = getFirebaseAuth()
  if (!authInstance) {
    callback(null)
    return () => {}
  }
  return onAuthStateChanged(authInstance, callback)
}

/**
 * Henter gyldig Firebase Auth ID-token (JWT).
 * Venter om en innlogging pågår, eller henter fra aktiv Firebase-bruker.
 */
export async function getFirebaseIdToken(): Promise<string | null> {
  const authInstance = getFirebaseAuth()
  if (!authInstance) return null

  // 1. Hvis en innlogging pågår, vent på den først
  if (signInPromise) {
    try {
      await signInPromise
    } catch {}
  }

  // 2. Hvis currentUser ennå ikke er klar, vent på authStateReady
  if (!authInstance.currentUser && typeof authInstance.authStateReady === 'function') {
    try {
      await authInstance.authStateReady()
    } catch {}
  }

  // 3. Hvis brukeren er tilgjengelig, hent ferskt Firebase ID-token
  if (authInstance.currentUser) {
    try {
      const token = await authInstance.currentUser.getIdToken()
      sessionStorage.setItem('tortur_firebase_token', token)
      return token
    } catch (err) {
      console.warn('[Firebase] Kunne ikke hente ID-token fra currentUser:', err)
    }
  }

  // 4. Returner eventuelt tidligere cachet Firebase-token
  return sessionStorage.getItem('tortur_firebase_token')
}

export type FirebaseMutationHook = (url: string) => void
let onMutationHook: FirebaseMutationHook | null = null

export function setFirebaseMutationHook(hook: FirebaseMutationHook | null): void {
  onMutationHook = hook
}

/**
 * Utfører en fetch-forespørsel mot Firebase Realtime Database med automatisk
 * vedlagt autentiseringstoken (?auth=<token>) fra Firebase Auth.
 */
export async function fetchFirebase(url: string, init?: RequestInit): Promise<Response> {
  const token = await getFirebaseIdToken()
  const authedUrl = token
    ? `${url}${url.includes('?') ? '&' : '?'}auth=${encodeURIComponent(token)}`
    : url

  const res = await fetch(authedUrl, init)
  if (res.ok && init?.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(init.method.toUpperCase())) {
    try {
      onMutationHook?.(url)
    } catch {}
  }
  return res
}

export { dbRef, set, get, update, remove, type DatabaseReference }
