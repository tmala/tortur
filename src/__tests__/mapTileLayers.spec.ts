import { describe, it, expect } from 'vitest'
import { createTileLayers, tileLayers } from '@/utils/mapTileLayers'

describe('mapTileLayers', () => {
  it('har definisjoner for standard, Google og Mapbox kartlag', () => {
    expect(tileLayers.standard).toBeDefined()
    expect(tileLayers.norgeskart).toBeDefined()
    expect(tileLayers.google_streets).toBeDefined()
    expect(tileLayers.mapbox_outdoors).toBeDefined()
    expect(tileLayers.mapbox_satellite_streets).toBeDefined()
    expect(tileLayers.mapbox_streets).toBeDefined()
    expect(tileLayers.carto_voyager).toBeDefined()
    expect(tileLayers.carto_positron).toBeDefined()
    expect(tileLayers.carto_dark_matter).toBeDefined()
  })

  it('oppretter standard OpenStreetMap-lag korrekt', () => {
    const { baseLayer, overlayLayer } = createTileLayers('standard')
    expect(baseLayer).toBeDefined()
    expect(overlayLayer).toBeNull()
    // Sjekk at standard URL peker til openstreetmap
    // @ts-expect-error Leaflet internt felt for testvalidering
    expect(baseLayer._url).toContain('openstreetmap.org')
  })

  it('faller tilbake til standardlag hvis Mapbox velges uten token', () => {
    const { baseLayer, overlayLayer } = createTileLayers('mapbox_outdoors')
    expect(baseLayer).toBeDefined()
    expect(overlayLayer).toBeNull()
    // @ts-expect-error Leaflet internt felt for testvalidering
    expect(baseLayer._url).toContain('openstreetmap.org')
  })

  it('faller tilbake til standardlag hvis Mapbox velges med tomt token', () => {
    const { baseLayer } = createTileLayers('mapbox_satellite_streets', { mapboxToken: '' })
    // @ts-expect-error Leaflet internt felt for testvalidering
    expect(baseLayer._url).toContain('openstreetmap.org')
  })

  it('bygger Mapbox Outdoors med gyldig token og 512px innstillinger', () => {
    const token = 'pk.test_outdoors_token_123'
    const { baseLayer } = createTileLayers('mapbox_outdoors', { mapboxToken: token })
    // @ts-expect-error Leaflet internt felt for testvalidering
    expect(baseLayer._url).toContain('api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/512')
    // @ts-expect-error Leaflet internt felt for testvalidering
    expect(baseLayer._url).toContain(`access_token=${token}`)
    expect(baseLayer.options.tileSize).toBe(512)
    expect(baseLayer.options.zoomOffset).toBe(-1)
    expect(baseLayer.options.maxZoom).toBe(22)
  })

  it('bygger Mapbox Satellite Streets med token', () => {
    const token = 'pk.test_sat_token_456'
    const { baseLayer } = createTileLayers('mapbox_satellite_streets', { mapboxToken: token })
    // @ts-expect-error Leaflet internt felt for testvalidering
    expect(baseLayer._url).toContain('api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512')
    // @ts-expect-error Leaflet internt felt for testvalidering
    expect(baseLayer._url).toContain(`access_token=${token}`)
  })

  it('bygger Mapbox Streets med token', () => {
    const token = 'pk.test_streets_token_789'
    const { baseLayer } = createTileLayers('mapbox_streets', { mapboxToken: token })
    // @ts-expect-error Leaflet internt felt for testvalidering
    expect(baseLayer._url).toContain('api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512')
    // @ts-expect-error Leaflet internt felt for testvalidering
    expect(baseLayer._url).toContain(`access_token=${token}`)
  })

  it('faller tilbake til standardlag hvis Carto velges uten API-nøkkel', () => {
    const { baseLayer, overlayLayer } = createTileLayers('carto_voyager')
    expect(baseLayer).toBeDefined()
    expect(overlayLayer).toBeNull()
    // @ts-expect-error Leaflet internt felt for testvalidering
    expect(baseLayer._url).toContain('openstreetmap.org')
  })

  it('faller tilbake til standardlag hvis Carto velges med tom nøkkel', () => {
    const { baseLayer } = createTileLayers('carto_positron', { cartoApiKey: '' })
    // @ts-expect-error Leaflet internt felt for testvalidering
    expect(baseLayer._url).toContain('openstreetmap.org')
  })

  it('bygger Carto Voyager med gyldig API-nøkkel', () => {
    const apiKey = 'test_carto_key_voyager'
    const { baseLayer } = createTileLayers('carto_voyager', { cartoApiKey: apiKey })
    // @ts-expect-error Leaflet internt felt for testvalidering
    expect(baseLayer._url).toContain('basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}')
    // @ts-expect-error Leaflet internt felt for testvalidering
    expect(baseLayer._url).toContain(`?key=${apiKey}`)
    expect(baseLayer.options.subdomains).toEqual(['a', 'b', 'c', 'd'])
    expect(baseLayer.options.maxZoom).toBe(20)
  })

  it('bygger Carto Positron med gyldig API-nøkkel', () => {
    const apiKey = 'test_carto_key_positron'
    const { baseLayer } = createTileLayers('carto_positron', { cartoApiKey: apiKey })
    // @ts-expect-error Leaflet internt felt for testvalidering
    expect(baseLayer._url).toContain('basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}')
    // @ts-expect-error Leaflet internt felt for testvalidering
    expect(baseLayer._url).toContain(`?key=${apiKey}`)
  })

  it('bygger Carto Dark Matter med gyldig API-nøkkel', () => {
    const apiKey = 'test_carto_key_dark'
    const { baseLayer } = createTileLayers('carto_dark_matter', { cartoApiKey: apiKey })
    // @ts-expect-error Leaflet internt felt for testvalidering
    expect(baseLayer._url).toContain('basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}')
    // @ts-expect-error Leaflet internt felt for testvalidering
    expect(baseLayer._url).toContain(`?key=${apiKey}`)
  })
})
