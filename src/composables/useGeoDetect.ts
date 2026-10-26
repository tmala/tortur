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

interface FeatureSpatialIndex {
  name: string
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
  coords: Array<[number, number]>
}

let spatialIndexCache: FeatureSpatialIndex[] | null = null

// ─── Avstandsberegning (Haversine i km) ───────────────────────────────────────
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function buildSpatialIndex(features: FeatureCollection['features']): FeatureSpatialIndex[] {
  const index: FeatureSpatialIndex[] = []

  for (const feature of features) {
    if (!feature.geometry) continue
    const name = (feature.properties?.['name'] as string) || ''
    if (!name) continue

    let minLat = 90
    let maxLat = -90
    let minLng = 180
    let maxLng = -180
    const coords: Array<[number, number]> = []

    function addRing(ring: number[][]): void {
      for (const pt of ring) {
        if (!pt || typeof pt[0] !== 'number' || typeof pt[1] !== 'number') continue
        const lng = pt[0]
        const lat = pt[1]
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
        if (lng < minLng) minLng = lng
        if (lng > maxLng) maxLng = lng
        coords.push([lat, lng])
      }
    }

    if (feature.geometry.type === 'Polygon') {
      const poly = feature.geometry.coordinates as number[][][]
      if (poly[0]) addRing(poly[0])
    } else if (feature.geometry.type === 'MultiPolygon') {
      const multi = feature.geometry.coordinates as number[][][][]
      for (const poly of multi) {
        if (poly[0]) addRing(poly[0])
      }
    }

    if (coords.length > 0) {
      index.push({ name, minLat, maxLat, minLng, maxLng, coords })
    }
  }

  return index
}

function findNearestKommuneName(pLat: number, pLng: number, maxKm = 25): string | null {
  if (!spatialIndexCache || spatialIndexCache.length === 0) return null

  let bestDist = Infinity
  let bestName: string | null = null

  for (const item of spatialIndexCache) {
    // Rask filtrering: beregn korteste avstand til kommunens ytterramme (bounding box)
    const nearLat = Math.max(item.minLat, Math.min(pLat, item.maxLat))
    const nearLng = Math.max(item.minLng, Math.min(pLng, item.maxLng))
    const dBox = distanceKm(pLat, pLng, nearLat, nearLng)
    if (dBox > bestDist) continue

    for (const [vLat, vLng] of item.coords) {
      const d = distanceKm(pLat, pLng, vLat, vLng)
      if (d < bestDist) {
        bestDist = d
        bestName = item.name
      }
    }
  }

  if (bestDist <= maxKm) {
    return bestName
  }
  return null
}

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
  if (geojsonCache && kommuneToFylke && spatialIndexCache) return

  const [geoRes, hierRes] = await Promise.all([
    fetch(import.meta.env.BASE_URL + 'data/kommuner.geojson'),
    fetch(import.meta.env.BASE_URL + 'data/hierarchy.json'),
  ])

  if (!geoRes.ok || !hierRes.ok) {
    throw new Error('Kunne ikke laste geodata')
  }

  geojsonCache = (await geoRes.json()) as FeatureCollection
  spatialIndexCache = buildSpatialIndex(geojsonCache.features)

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

export function _resetGeoDataCacheForTesting(): void {
  geojsonCache = null
  kommuneToFylke = null
  spatialIndexCache = null
}

// ─── Composable ─────────────────────────────────────────────────────────────
export function useGeoDetect() {
  async function detectKommune(lat: number, lng: number): Promise<GeoResult | null> {
    await loadGeoData()

    if (!geojsonCache || !kommuneToFylke) return null

    // 1. Eksakt treff innenfor kommunepolygon
    for (const feature of geojsonCache.features) {
      if (!feature.geometry) continue
      if (pointInGeometry(lat, lng, feature.geometry)) {
        const kommuneNavn: string = (feature.properties?.['name'] as string) || ''
        const fylkeNavn = kommuneToFylke.get(kommuneNavn.toLowerCase()) || ''
        return { fylke: fylkeNavn, kommune: kommuneNavn }
      }
    }

    // 2. Hvis punktet er i et kyst-/fjordområde eller like ved en kommune (opptil 25 km), finn nærmeste kommune
    // Dette sikrer at klikk eller GPS i fjorder (f.eks. Byfjorden) finner en relevant kommune i stedet for å feile
    if (lat >= 57.0 && lat <= 71.5 && lng >= 4.0 && lng <= 31.5) {
      const nearestName = findNearestKommuneName(lat, lng, 25)
      if (nearestName) {
        const fylkeNavn = kommuneToFylke.get(nearestName.toLowerCase()) || ''
        return { fylke: fylkeNavn, kommune: nearestName }
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

  return { detectKommune, isAbroad, _resetGeoDataCacheForTesting }
}
