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
 * Logger inn i Firebase Auth ved hjelp av et Google ID-token (JWT) fra GIS
 */
export async function signInWithGoogleIdToken(idToken: string): Promise<UserCredential | null> {
  const authInstance = getFirebaseAuth()
  if (!authInstance) {
    console.warn('[Firebase] Auth er ikke konfigurert. Kan ikke logge inn mot Firebase.')
    return null
  }
  const credential = GoogleAuthProvider.credential(idToken)
  return await signInWithCredential(authInstance, credential)
}

/**
 * Logger ut fra Firebase Auth
 */
export async function signOutFirebase(): Promise<void> {
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
 * Henter gyldig Firebase Auth ID-token (JWT)
 */
export async function getFirebaseIdToken(): Promise<string | null> {
  const authInstance = getFirebaseAuth()
  if (authInstance?.currentUser) {
    try {
      return await authInstance.currentUser.getIdToken()
    } catch (err) {
      console.warn('[Firebase] Kunne ikke hente ID-token fra currentUser:', err)
    }
  }
  return sessionStorage.getItem('tortur_id_token')
}

/**
 * Utfører en fetch-forespørsel mot Firebase Realtime Database med automatisk
 * vedlagt autentiseringstoken (?auth=<token>) fra Firebase Auth.
 */
export async function fetchFirebase(url: string, init?: RequestInit): Promise<Response> {
  const token = await getFirebaseIdToken()
  if (token) {
    const separator = url.includes('?') ? '&' : '?'
    const authedUrl = `${url}${separator}auth=${encodeURIComponent(token)}`
    return fetch(authedUrl, init)
  }
  return fetch(url, init)
}

export { dbRef, set, get, update, remove, type DatabaseReference }
