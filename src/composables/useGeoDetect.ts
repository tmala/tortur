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

const FYLKE_NUMMER_MAP: Record<string, string> = {
  '03': 'Oslo',
  '11': 'Rogaland',
  '15': 'Møre og Romsdal',
  '18': 'Nordland',
  '31': 'Østfold',
  '32': 'Akershus',
  '33': 'Buskerud',
  '34': 'Innlandet',
  '39': 'Vestfold',
  '40': 'Telemark',
  '42': 'Agder',
  '46': 'Vestland',
  '50': 'Trøndelag',
  '55': 'Troms',
  '56': 'Finnmark'
}

function resolveFylkeName(kommuneNavn: string, properties?: Record<string, unknown> | null): string {
  const fromHierarchy = kommuneToFylke?.get(kommuneNavn.toLowerCase())
  if (fromHierarchy) return fromHierarchy

  const knr = String(properties?.['kommunenummer'] || properties?.['id'] || '').trim()
  if (knr.length >= 2) {
    const fylke = FYLKE_NUMMER_MAP[knr.slice(0, 2)]
    if (fylke) return fylke
  }
  return ''
}

interface FeatureSpatialIndex {
  name: string
  fylke: string
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

    const fylke = resolveFylkeName(name, feature.properties as Record<string, unknown> | null)
    if (coords.length > 0) {
      index.push({ name, fylke, minLat, maxLat, minLng, maxLng, coords })
    }
  }

  return index
}

function findNearestKommune(pLat: number, pLng: number, maxKm = 25): { name: string; fylke: string } | null {
  if (!spatialIndexCache || spatialIndexCache.length === 0) return null

  let bestDist = Infinity
  let bestItem: FeatureSpatialIndex | null = null

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
        bestItem = item
      }
    }
  }

  if (bestDist <= maxKm && bestItem) {
    return { name: bestItem.name, fylke: bestItem.fylke }
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

  spatialIndexCache = buildSpatialIndex(geojsonCache.features)
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
        const fylkeNavn = resolveFylkeName(kommuneNavn, feature.properties as Record<string, unknown> | null)
        return { fylke: fylkeNavn, kommune: kommuneNavn }
      }
    }

    // 2. Hvis punktet er i et kyst-/fjordområde eller like ved en kommune (opptil 25 km), finn nærmeste kommune
    // Dette sikrer at klikk eller GPS i fjorder (f.eks. Byfjorden) finner en relevant kommune i stedet for å feile
    if (lat >= 57.0 && lat <= 71.5 && lng >= 4.0 && lng <= 31.5) {
      const nearest = findNearestKommune(lat, lng, 25)
      if (nearest) {
        const fylkeNavn = nearest.fylke || resolveFylkeName(nearest.name)
        return { fylke: fylkeNavn, kommune: nearest.name }
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
