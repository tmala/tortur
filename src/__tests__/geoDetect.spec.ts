import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FeatureCollection } from 'geojson'
import { useGeoDetect } from '../composables/useGeoDetect'

describe('useGeoDetect', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
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

    // Punkt i Stockholm, Sverige (innenfor lat 57-71.5, lng 4-31.5, men ikke i norsk kommune)
    const stockholmResult = await detectKommune(59.33, 18.06)
    expect(stockholmResult).toBeNull()
    const stockholmAbroad = await isAbroad(59.33, 18.06)
    expect(stockholmAbroad).toBe(true)
  })
})
