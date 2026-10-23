import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import {
  normalizeRtdbKey,
  isPathMatchForInvalidation,
  cachedFetchJson,
  invalidateRtdbPath,
  clearRtdbCache,
  setRtdbCacheStorageForTest,
  type IRtdbCacheStorage,
  type CacheEntry,
} from '@/services/rtdbCache'
import { fetchFirebase } from '@/services/firebase'

class TestMemoryStorage implements IRtdbCacheStorage {
  map = new Map<string, CacheEntry<unknown>>()

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

describe('rtdbCache service', () => {
  let fetchSpy: MockInstance
  let testStorage: TestMemoryStorage

  beforeEach(async () => {
    vi.restoreAllMocks()
    testStorage = new TestMemoryStorage()
    setRtdbCacheStorageForTest(testStorage)
    await clearRtdbCache()

    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('normalizeRtdbKey', () => {
    it('fjerner auth-token og prefixer med userId', () => {
      const url = 'https://db.firebaseio.com/secret/brukere/user_1/my_spots.json?auth=jwt_secret_token'
      const key = normalizeRtdbKey(url, 'user_1')
      expect(key).toBe('user_1:/secret/brukere/user_1/my_spots.json')
    })

    it('bruker public som prefix dersom userId mangler', () => {
      const url = 'https://db.firebaseio.com/secret/spot_suggestions.json'
      const key = normalizeRtdbKey(url)
      expect(key).toBe('public:/secret/spot_suggestions.json')
    })
  })

  describe('isPathMatchForInvalidation', () => {
    it('matcher eksakt sti', () => {
      const cached = 'user_1:/prefix/brukere/user_1/my_spots.json'
      const target = 'https://db.firebaseio.com/prefix/brukere/user_1/my_spots.json'
      expect(isPathMatchForInvalidation(cached, target, 'user_1')).toBe(true)
    })

    it('invaliderer parent collection ved endring i et underelement', () => {
      const cached = 'user_1:/prefix/brukere/user_1/my_spots.json'
      const target = 'https://db.firebaseio.com/prefix/brukere/user_1/my_spots/spot_99.json'
      expect(isPathMatchForInvalidation(cached, target, 'user_1')).toBe(true)
    })

    it('invaliderer undernoder ved endring i parent collection', () => {
      const cached = 'user_1:/prefix/brukere/user_1/my_spots/spot_99.json'
      const target = 'https://db.firebaseio.com/prefix/brukere/user_1/my_spots.json'
      expect(isPathMatchForInvalidation(cached, target, 'user_1')).toBe(true)
    })

    it('avviser urelaterte stier', () => {
      const cached = 'user_1:/prefix/brukere/user_1/tracks.json'
      const target = 'https://db.firebaseio.com/prefix/brukere/user_1/my_spots/spot_99.json'
      expect(isPathMatchForInvalidation(cached, target, 'user_1')).toBe(false)
    })
  })

  describe('cachedFetchJson', () => {
    it('lagrer data og ETag ved 200 OK på første henting', async () => {
      const mockData = { spot_1: { name: 'Kollen', lat: 60, lng: 10 } }
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ ETag: 'etag_123' }),
        json: async () => mockData,
      } as unknown as Response)

      const url = 'https://db.firebaseio.com/prefix/brukere/user_1/my_spots.json'
      const res = await cachedFetchJson<typeof mockData>(url, { userId: 'user_1' })

      expect(res.fromCache).toBe(false)
      expect(res.revalidated).toBe(true)
      expect(res.data).toEqual(mockData)
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      // Verifiser at det ble lagret i storage
      const stored = await testStorage.get<typeof mockData>('user_1:/prefix/brukere/user_1/my_spots.json')
      expect(stored).not.toBeNull()
      expect(stored?.etag).toBe('etag_123')
      expect(stored?.data).toEqual(mockData)
    })

    it('returnerer cachet verdi umiddelbart innenfor freshMs uten nettverkskall', async () => {
      const mockData = { track_1: { name: 'Tur 1' } }
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ ETag: 'etag_abc' }),
        json: async () => mockData,
      } as unknown as Response)

      const url = 'https://db.firebaseio.com/prefix/brukere/user_1/tracks.json'
      // Første kall
      await cachedFetchJson(url, { userId: 'user_1', freshMs: 10_000 })
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      // Andre kall (straks etter)
      const res2 = await cachedFetchJson(url, { userId: 'user_1', freshMs: 10_000 })
      expect(res2.fromCache).toBe(true)
      expect(res2.revalidated).toBe(false)
      expect(res2.data).toEqual(mockData)
      expect(fetchSpy).toHaveBeenCalledTimes(1) // Ingen nye nettverkskall!
    })

    it('sender If-None-Match og håndterer 304 Not Modified', async () => {
      const mockData = { friend_1: { userName: 'Ola' } }
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ ETag: 'etag_friend_1' }),
        json: async () => mockData,
      } as unknown as Response)

      const url = 'https://db.firebaseio.com/prefix/brukere/user_1/friends.json'
      await cachedFetchJson(url, { userId: 'user_1', freshMs: 0 }) // freshMs: 0 krever validering

      // Server svarer 304 Not Modified med tom body
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 304,
        headers: new Headers(),
      } as unknown as Response)

      const res2 = await cachedFetchJson(url, { userId: 'user_1', freshMs: 0 })
      expect(fetchSpy).toHaveBeenCalledTimes(2)

      // Sjekk at If-None-Match ble sendt med i andre kall
      const secondCallInit = fetchSpy.mock.calls[1]![1] as RequestInit
      expect((secondCallInit.headers as Record<string, string>)['If-None-Match']).toBe('etag_friend_1')
      expect((secondCallInit.headers as Record<string, string>)['X-Firebase-ETag']).toBe('true')

      // Data skal komme fra cache og være markert som revalidert
      expect(res2.fromCache).toBe(true)
      expect(res2.revalidated).toBe(true)
      expect(res2.data).toEqual(mockData)
    })

    it('faller tilbake på cachet versjon dersom nettverket kaster feil (offline)', async () => {
      const mockData = { item_1: { value: 42 } }
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ ETag: 'etag_off' }),
        json: async () => mockData,
      } as unknown as Response)

      const url = 'https://db.firebaseio.com/prefix/brukere/user_1/data.json'
      await cachedFetchJson(url, { userId: 'user_1', freshMs: 0 })

      // Simulere nettverksfeil
      fetchSpy.mockRejectedValueOnce(new Error('Network error / offline'))

      const fallbackRes = await cachedFetchJson(url, { userId: 'user_1', freshMs: 0 })
      expect(fallbackRes.fromCache).toBe(true)
      expect(fallbackRes.revalidated).toBe(false)
      expect(fallbackRes.data).toEqual(mockData)
    })

    it('dedupliserer parallelle forespørsler for samme ressurs (in-flight request sharing)', async () => {
      const mockData = { id: 1 }
      fetchSpy.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 200,
                  headers: new Headers({ ETag: 'etag_par' }),
                  json: async () => mockData,
                } as unknown as Response),
              20,
            ),
          ),
      )

      const url = 'https://db.firebaseio.com/prefix/brukere/user_1/shared.json'
      const [resA, resB] = await Promise.all([
        cachedFetchJson(url, { userId: 'user_1', freshMs: 0 }),
        cachedFetchJson(url, { userId: 'user_1', freshMs: 0 }),
      ])

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(resA.data).toEqual(mockData)
      expect(resB.data).toEqual(mockData)
    })
  })

  describe('Invalidering ved mutasjoner', () => {
    it('invalidateRtdbPath fjerner tilhørende samling og elementer', async () => {
      const mockData = { spot_1: { name: 'Kollen' } }
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ ETag: 'etag_1' }),
        json: async () => mockData,
      } as unknown as Response)

      const collectionUrl = 'https://db.firebaseio.com/prefix/brukere/user_1/my_spots.json'
      await cachedFetchJson(collectionUrl, { userId: 'user_1', freshMs: 10_000 })

      // Invalider gjennom endring i et underelement
      await invalidateRtdbPath('https://db.firebaseio.com/prefix/brukere/user_1/my_spots/spot_1.json', 'user_1')

      // Neste henting må nå gå til nettverket på nytt
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ ETag: 'etag_2' }),
        json: async () => ({ spot_1: { name: 'Kollen oppdatert' } }),
      } as unknown as Response)

      const refreshed = await cachedFetchJson(collectionUrl, { userId: 'user_1', freshMs: 10_000 })
      expect(fetchSpy).toHaveBeenCalledTimes(2)
      expect(refreshed.fromCache).toBe(false)
    })

    it('mutasjoner utført med fetchFirebase (PUT/PATCH/DELETE) invaliderer cachen automatisk', async () => {
      const mockData = { checkin_1: { note: 'Fin tur' } }
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ ETag: 'etag_chk' }),
        json: async () => mockData,
      } as unknown as Response)

      const listUrl = 'https://db.firebaseio.com/prefix/brukere/user_1/friends_checkins.json'
      await cachedFetchJson(listUrl, { userId: 'user_1', freshMs: 60_000 })

      // Utfør en PUT på et sjekkinn via fetchFirebase
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as unknown as Response)

      await fetchFirebase('https://db.firebaseio.com/prefix/brukere/user_1/friends_checkins/checkin_1.json', {
        method: 'PUT',
        body: JSON.stringify({ note: 'Endret notat' }),
      })

      // Neste henting av friends_checkins skal nå ikke returneres fra fersk cache, men hente ferske data!
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ ETag: 'etag_chk2' }),
        json: async () => ({ checkin_1: { note: 'Endret notat' } }),
      } as unknown as Response)

      const result = await cachedFetchJson(listUrl, { userId: 'user_1', freshMs: 60_000 })
      expect(result.fromCache).toBe(false)
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })
  })

  describe('clearRtdbCache', () => {
    it('tømmer både minne og lagring', async () => {
      const mockData = { a: 1 }
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ ETag: 'etag_a' }),
        json: async () => mockData,
      } as unknown as Response)

      const url = 'https://db.firebaseio.com/prefix/test.json'
      await cachedFetchJson(url, { freshMs: 10_000 })

      await clearRtdbCache()

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ ETag: 'etag_b' }),
        json: async () => ({ a: 2 }),
      } as unknown as Response)

      const res = await cachedFetchJson(url, { freshMs: 10_000 })
      expect(fetchSpy).toHaveBeenCalledTimes(2)
      expect(res.fromCache).toBe(false)
    })
  })
})
