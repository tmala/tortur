import { fetchFirebase, setFirebaseMutationHook } from './firebase'

export interface CacheEntry<T = unknown> {
  key: string
  etag: string | null
  data: T
  fetchedAt: number
}

export interface CachedJsonResult<T> {
  data: T | null
  fromCache: boolean
  revalidated: boolean
}

export interface CacheOptions {
  userId?: string | null
  freshMs?: number
  forceRefresh?: boolean
  onUpdate?: (data: unknown) => void
}

export interface IRtdbCacheStorage {
  get<T>(key: string): Promise<CacheEntry<T> | null>
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>
  delete(key: string): Promise<void>
  deleteMatching?(predicate: (key: string) => boolean): Promise<void>
  clear(): Promise<void>
}

export const RTDB_CACHE_ENABLED = true
export const DEFAULT_FRESH_MS = 30_000

class MemoryCacheStorage implements IRtdbCacheStorage {
  private map = new Map<string, CacheEntry<unknown>>()

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const entry = this.map.get(key)
    return entry ? (entry as CacheEntry<T>) : null
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    this.map.set(key, entry as CacheEntry<unknown>)
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key)
  }

  async deleteMatching(predicate: (key: string) => boolean): Promise<void> {
    for (const key of Array.from(this.map.keys())) {
      if (predicate(key)) {
        this.map.delete(key)
      }
    }
  }

  async clear(): Promise<void> {
    this.map.clear()
  }
}

class IndexedDbCacheStorage implements IRtdbCacheStorage {
  private dbPromise: Promise<IDBDatabase | null> | null = null

  private getDb(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise

    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      return Promise.resolve(null)
    }

    this.dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open('tortur_rtdb_cache', 1)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('entries')) {
            db.createObjectStore('entries', { keyPath: 'key' })
          }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => {
          console.warn('[rtdbCache] Kunne ikke åpne IndexedDB, bruker minnefallback')
          resolve(null)
        }
      } catch {
        resolve(null)
      }
    })

    return this.dbPromise
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const db = await this.getDb()
    if (!db) return null

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('entries', 'readonly')
        const store = tx.objectStore('entries')
        const req = store.get(key)
        req.onsuccess = () => resolve((req.result as CacheEntry<T>) || null)
        req.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    const db = await this.getDb()
    if (!db) return

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('entries', 'readwrite')
        const store = tx.objectStore('entries')
        const req = store.put(entry)
        req.onsuccess = () => resolve()
        req.onerror = () => resolve()
      } catch {
        resolve()
      }
    })
  }

  async delete(key: string): Promise<void> {
    const db = await this.getDb()
    if (!db) return

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('entries', 'readwrite')
        const store = tx.objectStore('entries')
        const req = store.delete(key)
        req.onsuccess = () => resolve()
        req.onerror = () => resolve()
      } catch {
        resolve()
      }
    })
  }

  async deleteMatching(predicate: (key: string) => boolean): Promise<void> {
    const db = await this.getDb()
    if (!db) return

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('entries', 'readwrite')
        const store = tx.objectStore('entries')
        const req = store.getAllKeys()
        req.onsuccess = () => {
          const keys = req.result as string[]
          for (const k of keys) {
            if (predicate(k)) {
              store.delete(k)
            }
          }
          resolve()
        }
        req.onerror = () => resolve()
      } catch {
        resolve()
      }
    })
  }

  async clear(): Promise<void> {
    const db = await this.getDb()
    if (!db) return

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('entries', 'readwrite')
        const store = tx.objectStore('entries')
        const req = store.clear()
        req.onsuccess = () => resolve()
        req.onerror = () => resolve()
      } catch {
        resolve()
      }
    })
  }
}

// Lagringsadapter: bruk IndexedDB i nettleser, eller MemoryCacheStorage
let storageInstance: IRtdbCacheStorage =
  typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
    ? new IndexedDbCacheStorage()
    : new MemoryCacheStorage()

export function setRtdbCacheStorageForTest(customStorage: IRtdbCacheStorage | null): void {
  storageInstance = customStorage || new MemoryCacheStorage()
}

// Raskt minnelag i minnet
const memoryCache = new Map<string, CacheEntry<unknown>>()

// In-flight deduplisering av parallelle requests
const inFlightRequests = new Map<string, Promise<CachedJsonResult<unknown>>>()

export function normalizeRtdbKey(url: string, userId?: string | null): string {
  const uid = userId && userId.trim() ? userId.trim() : 'public'
  try {
    const parsed = new URL(url, 'https://dummy.local')
    parsed.searchParams.delete('auth')
    const cleanPath = parsed.pathname + (parsed.search ? parsed.search : '')
    return `${uid}:${cleanPath}`
  } catch {
    const clean = url.split('?')[0]
    return `${uid}:${clean}`
  }
}

/**
 * Henter JSON fra RTDB med støtte for ETag og lokal lagring (IndexedDB + minne).
 */
export async function cachedFetchJson<T>(
  url: string,
  opts?: CacheOptions,
): Promise<CachedJsonResult<T>> {
  if (!RTDB_CACHE_ENABLED) {
    const res = await fetchFirebase(url)
    if (!res.ok) {
      return { data: null, fromCache: false, revalidated: true }
    }
    const data = (await res.json()) as T
    return { data, fromCache: false, revalidated: true }
  }

  const key = normalizeRtdbKey(url, opts?.userId)
  const freshMs = opts?.freshMs ?? DEFAULT_FRESH_MS
  const now = Date.now()

  // 1. Sjekk minnecache
  let entry: CacheEntry<T> | null = (memoryCache.get(key) as CacheEntry<T>) || null

  // 2. Hvis ikke i minne, sjekk persistent lagring (IndexedDB)
  if (!entry) {
    entry = await storageInstance.get<T>(key)
    if (entry) {
      memoryCache.set(key, entry as CacheEntry<unknown>)
    }
  }

  // 3. Hvis cachen er helt fersk og ikke forceRefresh, returner umiddelbart
  if (!opts?.forceRefresh && entry && now - entry.fetchedAt < freshMs) {
    return {
      data: entry.data,
      fromCache: true,
      revalidated: false,
    }
  }

  // 4. Hvis en forespørsel for samme nøkkel allerede pågår, gjenbruk det aktive løftet
  const existingInFlight = inFlightRequests.get(key)
  if (existingInFlight) {
    const res = await existingInFlight
    return res as CachedJsonResult<T>
  }

  // 5. Gjennomfør nettverksforespørsel med ETag
  const fetchPromise = (async (): Promise<CachedJsonResult<T>> => {
    try {
      const headers: Record<string, string> = {
        'X-Firebase-ETag': 'true',
      }
      if (entry?.etag) {
        headers['If-None-Match'] = entry.etag
      }

      const res = await fetchFirebase(url, { headers })

      // 304 Not Modified: Data er uendret på serveren!
      if (res.status === 304 && entry) {
        entry.fetchedAt = Date.now()
        memoryCache.set(key, entry as CacheEntry<unknown>)
        storageInstance.set(key, entry).catch(() => {})
        return {
          data: entry.data,
          fromCache: true,
          revalidated: true,
        }
      }

      // 200 OK: Ferske data
      if (res.ok) {
        const newEtag = res.headers?.get ? (res.headers.get('ETag') || res.headers.get('etag') || null) : null
        const freshData = (await res.json()) as T
        const newEntry: CacheEntry<T> = {
          key,
          etag: newEtag,
          data: freshData,
          fetchedAt: Date.now(),
        }

        memoryCache.set(key, newEntry as CacheEntry<unknown>)
        storageInstance.set(key, newEntry).catch(() => {})

        if (opts?.onUpdate && entry && JSON.stringify(entry.data) !== JSON.stringify(freshData)) {
          opts.onUpdate(freshData)
        }

        return {
          data: freshData,
          fromCache: false,
          revalidated: true,
        }
      }

      // Feilrespons fra server: hvis vi har cache, fall tilbake på den
      if (entry) {
        return {
          data: entry.data,
          fromCache: true,
          revalidated: false,
        }
      }

      return {
        data: null,
        fromCache: false,
        revalidated: true,
      }
    } catch (err) {
      // Nettverksfeil / offline: hvis vi har cache, returner den
      if (entry) {
        return {
          data: entry.data,
          fromCache: true,
          revalidated: false,
        }
      }
      throw err
    } finally {
      inFlightRequests.delete(key)
    }
  })()

  inFlightRequests.set(key, fetchPromise as Promise<CachedJsonResult<unknown>>)
  return (await fetchPromise) as CachedJsonResult<T>
}

function extractCleanPath(urlOrPath: string): string {
  try {
    const parsed = new URL(urlOrPath, 'https://dummy.local')
    return parsed.pathname
  } catch {
    return urlOrPath.split('?')[0] || ''
  }
}

export function isPathMatchForInvalidation(
  cachedKey: string,
  targetUrlOrPath: string,
  userId?: string | null,
): boolean {
  const targetClean = extractCleanPath(targetUrlOrPath)
  const targetBase = targetClean.replace(/\.json$/, '')

  // cachedKey er på formatet `${uid}:${cleanPath}`
  const colonIdx = cachedKey.indexOf(':')
  const cachedUid = colonIdx !== -1 ? cachedKey.slice(0, colonIdx) : null
  const cachedPath = colonIdx !== -1 ? cachedKey.slice(colonIdx + 1) : cachedKey
  const cachedClean = extractCleanPath(cachedPath)
  const cachedBase = cachedClean.replace(/\.json$/, '')

  // Hvis userId er oppgitt og cachedUid eksisterer, sjekk match
  if (userId && cachedUid && cachedUid !== 'public' && cachedUid !== userId) {
    return false
  }

  // 1. Eksakt match
  if (cachedClean === targetClean || cachedBase === targetBase) {
    return true
  }

  // 2. target er en endring i et underelement, så parent collection må invalideres:
  // F.eks. targetBase = ".../my_spots/spot_1", cachedBase = ".../my_spots"
  if (targetBase.startsWith(cachedBase + '/')) {
    return true
  }

  // 3. target er en endring i parent collection, så underelementer må invalideres:
  // F.eks. targetBase = ".../my_spots", cachedBase = ".../my_spots/spot_1"
  if (cachedBase.startsWith(targetBase + '/')) {
    return true
  }

  return false
}

/**
 * Invaliderer en spesifikk sti eller URL fra cachen.
 */
export async function invalidateRtdbPath(urlOrPath: string, userId?: string | null): Promise<void> {
  const predicate = (k: string) => isPathMatchForInvalidation(k, urlOrPath, userId)

  // Fjern fra minnecache
  for (const k of Array.from(memoryCache.keys())) {
    if (predicate(k)) {
      memoryCache.delete(k)
      storageInstance.delete(k).catch(() => {})
    }
  }

  // Fjern fra persistent lagring
  if (storageInstance.deleteMatching) {
    await storageInstance.deleteMatching(predicate)
  }
}

/**
 * Tømmer all RTDB-cache (f.eks. ved utlogging).
 */
export async function clearRtdbCache(): Promise<void> {
  memoryCache.clear()
  inFlightRequests.clear()
  await storageInstance.clear()
}

// Koble til automatisk ugyldiggjøring ved skrivinger via fetchFirebase
setFirebaseMutationHook((url) => {
  invalidateRtdbPath(url).catch(() => {})
})

