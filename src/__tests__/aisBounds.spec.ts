import { describe, it, expect, beforeEach } from 'vitest'
import { expandBounds, isBoundsContained, useAis, type AisMapBounds } from '@/composables/useAis'

describe('AIS Bounding Box & Buffer calculations', () => {
  const baseBounds: AisMapBounds = {
    minLat: 60.0,
    maxLat: 60.1,
    minLng: 5.0,
    maxLng: 5.2
  }

  it('expandBounds utvider grensene med standard 40% (0.4)', () => {
    const buffered = expandBounds(baseBounds, 0.4)
    const latSpan = 60.1 - 60.0 // 0.1
    const lngSpan = 5.2 - 5.0  // 0.2

    expect(buffered.minLat).toBeCloseTo(60.0 - 0.1 * 0.4, 5)
    expect(buffered.maxLat).toBeCloseTo(60.1 + 0.1 * 0.4, 5)
    expect(buffered.minLng).toBeCloseTo(5.0 - 0.2 * 0.4, 5)
    expect(buffered.maxLng).toBeCloseTo(5.2 + 0.2 * 0.4, 5)
  })

  it('expandBounds støtter egendefinert bufferRatio', () => {
    const buffered = expandBounds(baseBounds, 0.5)
    expect(buffered.minLat).toBeCloseTo(60.0 - 0.1 * 0.5, 5)
    expect(buffered.maxLat).toBeCloseTo(60.1 + 0.1 * 0.5, 5)
  })

  it('isBoundsContained returnerer true når indre utsnitt er innenfor ytre utsnitt', () => {
    const outer = expandBounds(baseBounds, 0.4)

    // Det opprinnelige utsnittet skal være inneholdt i det bufrede
    expect(isBoundsContained(baseBounds, outer)).toBe(true)

    // En liten panorering (f.eks. 10% forskyvning) skal fremdeles være inneholdt
    const slightlyPanned: AisMapBounds = {
      minLat: 60.01,
      maxLat: 60.11,
      minLng: 5.02,
      maxLng: 5.22
    }
    expect(isBoundsContained(slightlyPanned, outer)).toBe(true)
  })

  it('isBoundsContained returnerer false når kartet panores utenfor bufferen', () => {
    const outer = expandBounds(baseBounds, 0.4)

    // Panorert langt mot nord
    const farNorth: AisMapBounds = {
      minLat: 60.2,
      maxLat: 60.3,
      minLng: 5.0,
      maxLng: 5.2
    }
    expect(isBoundsContained(farNorth, outer)).toBe(false)

    // Panorert mot vest
    const farWest: AisMapBounds = {
      minLat: 60.0,
      maxLat: 60.1,
      minLng: 4.5,
      maxLng: 4.7
    }
    expect(isBoundsContained(farWest, outer)).toBe(false)
  })

  it('isBoundsContained håndterer identiske grenser som inneholdt', () => {
    expect(isBoundsContained(baseBounds, baseBounds)).toBe(true)
  })
})

describe('useAis spatial buffer og caching oppførsel', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('initierer med cachedFetchBounds = null og tomme fartøy', () => {
    const { vessels, cachedFetchBounds, isEnabled } = useAis()
    expect(isEnabled.value).toBe(false)
    expect(cachedFetchBounds.value).toBeNull()
    expect(vessels.value).toEqual([])
  })

  it('henter ikke fartøy og tømmer cache dersom zoom < 12', async () => {
    const { toggleAis, fetchVessels, cachedFetchBounds, vessels } = useAis()
    toggleAis() // aktiver AIS

    await fetchVessels({ minLat: 60, maxLat: 60.1, minLng: 5, maxLng: 5.2 }, 11)
    expect(vessels.value).toEqual([])
    expect(cachedFetchBounds.value).toBeNull()
  })

  it('lagrer bufrede grenser etter vellykket henting', async () => {
    const { toggleAis, fetchVessels, cachedFetchBounds, vessels } = useAis()
    toggleAis()

    const bounds: AisMapBounds = { minLat: 60.0, maxLat: 60.1, minLng: 5.0, maxLng: 5.2 }
    await fetchVessels(bounds, 13)

    expect(cachedFetchBounds.value).not.toBeNull()
    expect(cachedFetchBounds.value!.minLat).toBeLessThan(bounds.minLat)
    expect(cachedFetchBounds.value!.maxLat).toBeGreaterThan(bounds.maxLat)
    expect(vessels.value.length).toBeGreaterThan(0)
  })

  it('hopper over ny henting dersom kartet panores innenfor det bufrede området uten force', async () => {
    const { toggleAis, fetchVessels, cachedFetchBounds, vessels } = useAis()
    toggleAis()

    const bounds1: AisMapBounds = { minLat: 60.0, maxLat: 60.1, minLng: 5.0, maxLng: 5.2 }
    await fetchVessels(bounds1, 13)
    const initialCached = { ...cachedFetchBounds.value! }
    const initialVessels = [...vessels.value]

    // Panorering litt til siden (innenfor 40% buffersonen)
    const bounds2: AisMapBounds = { minLat: 60.01, maxLat: 60.11, minLng: 5.01, maxLng: 5.21 }
    await fetchVessels(bounds2, 13, false)

    // Cached bounds og fartøyliste skal være urørt (ingen unødig fetch)
    expect(cachedFetchBounds.value).toEqual(initialCached)
    expect(vessels.value).toEqual(initialVessels)
  })

  it('nullstiller cachedFetchBounds når AIS slås av', async () => {
    const { toggleAis, fetchVessels, cachedFetchBounds } = useAis()
    toggleAis()
    await fetchVessels({ minLat: 60.0, maxLat: 60.1, minLng: 5.0, maxLng: 5.2 }, 13)
    expect(cachedFetchBounds.value).not.toBeNull()

    toggleAis() // slå av
    expect(cachedFetchBounds.value).toBeNull()
  })
})
