import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchElevationNorway, extractElevation } from '../services/elevation'

describe('elevation service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('extractElevation', () => {
    it('returns null for null, undefined or non-object input', () => {
      expect(extractElevation(null)).toBeNull()
      expect(extractElevation(undefined)).toBeNull()
      expect(extractElevation('invalid')).toBeNull()
      expect(extractElevation(123)).toBeNull()
    })

    it('extracts elevation from top-level z, terreng, or høyde', () => {
      expect(extractElevation({ z: 642.4 })).toBe(642)
      expect(extractElevation({ terreng: 310.8 })).toBe(311)
      expect(extractElevation({ høyde: 150 })).toBe(150)
      expect(extractElevation({ hoyde: 99.2 })).toBe(99)
    })

    it('extracts elevation from punkter array', () => {
      expect(extractElevation({ punkter: [{ z: 820.6, datakilde: 'NDH' }] })).toBe(821)
      expect(extractElevation({ punkter: [{ terreng: 412 }] })).toBe(412)
      expect(extractElevation({ punkter: [{ høyde: 55.4 }] })).toBe(55)
    })

    it('extracts elevation from punkt array or single object', () => {
      expect(extractElevation({ punkt: [{ z: 1204.1 }] })).toBe(1204)
      expect(extractElevation({ punkt: { z: 980 } })).toBe(980)
      expect(extractElevation({ punkt: { terreng: 745.3 } })).toBe(745)
    })

    it('handles numeric strings gracefully', () => {
      expect(extractElevation({ z: '456.7' })).toBe(457)
    })

    it('returns null for extreme out-of-range values or NaN', () => {
      expect(extractElevation({ z: -9999 })).toBeNull()
      expect(extractElevation({ z: 15000 })).toBeNull()
      expect(extractElevation({ z: NaN })).toBeNull()
    })
  })

  describe('fetchElevationNorway', () => {
    it('returns null immediately for coordinates far outside Norway without calling fetch', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')

      // Spania (Guardamar)
      const resSpain = await fetchElevationNorway(38.0904, -0.6577)
      expect(resSpain).toBeNull()

      // England (London)
      const resLondon = await fetchElevationNorway(51.5074, -0.1278)
      expect(resLondon).toBeNull()

      // Tokyo
      const resTokyo = await fetchElevationNorway(35.6762, 139.6503)
      expect(resTokyo).toBeNull()

      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('fetches elevation from Geonorge for coordinates in Norway and returns rounded meters', async () => {
      const mockResponse = {
        punkter: [
          {
            ost: 297000,
            nord: 6695000,
            koordsys: 4258,
            z: 643.2,
            terreng: 643.2,
            datakilde: 'NDH'
          }
        ]
      }

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as unknown as Response)

      const elevation = await fetchElevationNorway(60.378, 5.385)
      expect(elevation).toBe(643)
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('ws.geonorge.no/hoydedata/v1/punkt'),
        expect.any(Object)
      )
    })

    it('returns null gracefully when network fetch fails or responds with non-ok', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500
      } as unknown as Response)

      const elevation = await fetchElevationNorway(60.378, 5.385)
      expect(elevation).toBeNull()
    })

    it('returns null gracefully when network throws an exception', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

      const elevation = await fetchElevationNorway(60.378, 5.385)
      expect(elevation).toBeNull()
    })

    it('returns null and aborts gracefully when externalSignal is aborted', async () => {
      const controller = new AbortController()
      vi.spyOn(globalThis, 'fetch').mockImplementation((_url, opts) => {
        const signal = (opts as RequestInit)?.signal
        return new Promise((_, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      })

      const promise = fetchElevationNorway(60.378, 5.385, controller.signal)
      controller.abort()
      const res = await promise
      expect(res).toBeNull()
    })
  })
})
