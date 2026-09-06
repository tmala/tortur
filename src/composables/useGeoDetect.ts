/**
 * useGeoDetect – punkt-i-polygon-deteksjon av kommune og fylke.
 *
 * Laster kommuner.geojson én gang og cacher i minnet.
 * Bruker ray casting-algoritmen for å finne hvilken kommune et punkt tilhører.
 * Slår opp fylke fra hierarchy.json via kommunenavn.
 */

import type { FeatureCollection, Geometry } from 'geojson'

export interface GeoResult {
  fylke: string
  kommune: string
}

// ─── Interne cache-variabler ─────────────────────────────────────────────────
let geojsonCache: FeatureCollection | null = null
let kommuneToFylke: Map<string, string> | null = null

// ─── Punkt-i-polygon (ray casting) ───────────────────────────────────────────
function pointInPolygon(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!  // lng
    const yi = ring[i]![1]!  // lat
    const xj = ring[j]![0]!
    const yj = ring[j]![1]!
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function pointInGeometry(lat: number, lng: number, geometry: Geometry): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygon(lat, lng, geometry.coordinates[0] as number[][])
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as number[][][][]).some((polygon: number[][][]) =>
      pointInPolygon(lat, lng, polygon[0] as number[][])
    )
  }
  return false
}

// ─── Last data ───────────────────────────────────────────────────────────────
async function loadGeoData(): Promise<void> {
  if (geojsonCache && kommuneToFylke) return

  const [geoRes, hierRes] = await Promise.all([
    fetch(import.meta.env.BASE_URL + 'data/kommuner.geojson'),
    fetch(import.meta.env.BASE_URL + 'data/hierarchy.json'),
  ])

  if (!geoRes.ok || !hierRes.ok) {
    throw new Error('Kunne ikke laste geodata')
  }

  geojsonCache = (await geoRes.json()) as FeatureCollection

  const hierarchy = (await hierRes.json()) as Array<{
    name: string
    kommuner: Array<{ name: string }>
  }>

  kommuneToFylke = new Map()
  for (const fylke of hierarchy) {
    for (const kommune of fylke.kommuner) {
      kommuneToFylke.set(kommune.name.toLowerCase(), fylke.name)
    }
  }
}

// ─── Composable ─────────────────────────────────────────────────────────────
export function useGeoDetect() {
  async function detectKommune(lat: number, lng: number): Promise<GeoResult | null> {
    await loadGeoData()

    if (!geojsonCache || !kommuneToFylke) return null

    for (const feature of geojsonCache.features) {
      if (!feature.geometry) continue
      if (pointInGeometry(lat, lng, feature.geometry)) {
        const kommuneNavn: string = (feature.properties?.['name'] as string) || ''
        const fylkeNavn = kommuneToFylke.get(kommuneNavn.toLowerCase()) || ''
        return { fylke: fylkeNavn, kommune: kommuneNavn }
      }
    }

    return null
  }

  async function isAbroad(lat: number, lng: number): Promise<boolean> {
    // Fastlands-Norge og nærliggende kystområder ligger innenfor ca. 57.0° - 71.5° N og 4.0° - 31.5° Ø.
    // Koordinater utenfor denne avgrensningen er garantert i utlandet.
    if (lat < 57.0 || lat > 71.5 || lng < 4.0 || lng > 31.5) {
      return true
    }
    try {
      const match = await detectKommune(lat, lng)
      return match === null
    } catch {
      return false
    }
  }

  return { detectKommune, isAbroad }
}
