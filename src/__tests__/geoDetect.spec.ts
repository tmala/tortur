import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FeatureCollection } from 'geojson'
import { useGeoDetect, _resetGeoDataCacheForTesting } from '../composables/useGeoDetect'

describe('useGeoDetect', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    _resetGeoDataCacheForTesting()
  })

  it('identifies coordinates far outside Norway as abroad without needing network fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { isAbroad } = useGeoDetect()

    // Guardamar del Segura, Spania
    const abroadGuardamar = await isAbroad(38.0904, -0.6577)
    expect(abroadGuardamar).toBe(true)

    // Mallorca, Spania
    const abroadMallorca = await isAbroad(39.6953, 3.0176)
    expect(abroadMallorca).toBe(true)

    // London, Storbritannia
    const abroadLondon = await isAbroad(51.5074, -0.1278)
    expect(abroadLondon).toBe(true)

    // Tokyo, Japan
    const abroadTokyo = await isAbroad(35.6762, 139.6503)
    expect(abroadTokyo).toBe(true)

    // Siden disse er helt utenfor Norges yttergrenser (lat 57-71.5, lng 4-31.5),
    // skal funksjonen returnere true umiddelbart uten å hente kommuner.geojson
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('correctly detects location in Norway vs abroad within Nordic region', async () => {
    // Mock fetch for kommuner.geojson og hierarchy.json
    const mockGeoJson: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Bergen' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [5.2, 60.3],
                [5.4, 60.3],
                [5.4, 60.5],
                [5.2, 60.5],
                [5.2, 60.3]
              ]
            ]
          }
        }
      ]
    }

    const mockHierarchy = [
      {
        name: 'Vestland',
        kommuner: [{ name: 'Bergen' }]
      }
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('kommuner.geojson')) {
        return {
          ok: true,
          json: async () => mockGeoJson
        } as Response
      }
      if (urlStr.includes('hierarchy.json')) {
        return {
          ok: true,
          json: async () => mockHierarchy
        } as Response
      }
      return { ok: false } as Response
    })

    const { detectKommune, isAbroad } = useGeoDetect()

    // Punkt i Bergen (innenfor polygon)
    const bergenResult = await detectKommune(60.39, 5.32)
    expect(bergenResult).toEqual({ fylke: 'Vestland', kommune: 'Bergen' })
    const bergenAbroad = await isAbroad(60.39, 5.32)
    expect(bergenAbroad).toBe(false)

    // Punkt i Byfjorden/sjø like utenfor Bergen-polygonet (ca. 5 km øst for polygonet på 5.5°Ø)
    // Skal finne Bergen via nærmeste kommune fallback og IKKE markeres som utland
    const fjordResult = await detectKommune(60.4, 5.5)
    expect(fjordResult).toEqual({ fylke: 'Vestland', kommune: 'Bergen' })
    const fjordAbroad = await isAbroad(60.4, 5.5)
    expect(fjordAbroad).toBe(false)

    // Punkt i Stockholm, Sverige (innenfor lat 57-71.5, lng 4-31.5, men > 25 km fra norsk kommune)
    const stockholmResult = await detectKommune(59.33, 18.06)
    expect(stockholmResult).toBeNull()
    const stockholmAbroad = await isAbroad(59.33, 18.06)
    expect(stockholmAbroad).toBe(true)
  })

  it('resolves fylke from kommunenummer when municipality is missing from hierarchy.json', async () => {
    // Vestby (kommunenummer 3216 -> 32 = Akershus) som ikke finnes i hierarchy
    const mockGeoJson: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Vestby', kommunenummer: '3216' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [10.6, 59.5],
                [10.8, 59.5],
                [10.8, 59.7],
                [10.6, 59.7],
                [10.6, 59.5]
              ]
            ]
          }
        }
      ]
    }

    // hierarchy.json har IKKE Vestby
    const mockHierarchy = [
      {
        name: 'Vestland',
        kommuner: [{ name: 'Bergen' }]
      }
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('kommuner.geojson')) {
        return {
          ok: true,
          json: async () => mockGeoJson
        } as Response
      }
      if (urlStr.includes('hierarchy.json')) {
        return {
          ok: true,
          json: async () => mockHierarchy
        } as Response
      }
      return { ok: false } as Response
    })

    const { detectKommune } = useGeoDetect()
    const result = await detectKommune(59.6, 10.7)
    expect(result).toEqual({ fylke: 'Akershus', kommune: 'Vestby' })
  })
})

