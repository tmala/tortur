import type { TrackPoint } from '@/composables/useGeolocation'
import { calculateDistanceMeters } from '@/composables/useGeolocation'

export interface InterpolatedTrackPosition {
  lat: number
  lng: number
  bearing: number
  progress: number // 0.0 til 1.0
}

/**
 * Beregner kompasskurs / peiling (0° - 360°) fra punkt 1 til punkt 2 ved hjelp av storsirkelformelen.
 * 0° = Nord, 90° = Øst, 180° = Sør, 270° = Vest.
 */
export function calculateBearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0

  const toRad = (deg: number) => (deg * Math.PI) / 180
  const toDeg = (rad: number) => (rad * 180) / Math.PI

  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δλ = toRad(lon2 - lon1)

  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  const θ = Math.atan2(y, x)
  return (toDeg(θ) + 360) % 360
}

/**
 * Sjekker om et spor har gyldige tidsstempler med positiv varighet.
 */
export function hasTrackTimestamps(points: TrackPoint[]): boolean {
  if (points.length < 2) return false
  const first = points[0]?.timestamp
  const last = points[points.length - 1]?.timestamp
  return typeof first === 'number' && typeof last === 'number' && last > first
}

/**
 * Beregner sporets totale varighet i millisekunder.
 * Dersom sporet mangler tidsstempler, estimeres varigheten basert på 4.5 km/t (1.25 m/s).
 */
export function getTrackDurationMs(points: TrackPoint[]): number {
  if (!points || points.length < 2) return 0

  if (hasTrackTimestamps(points)) {
    const first = points[0]!.timestamp!
    const last = points[points.length - 1]!.timestamp!
    return Math.max(1000, last - first)
  }

  let totalDist = 0
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1]
    const p2 = points[i]
    if (p1 && p2) {
      totalDist += calculateDistanceMeters(p1.lat, p1.lng, p2.lat, p2.lng)
    }
  }

  const speedMetersPerSec = 1.25
  return Math.max(1000, Math.round((totalDist / speedMetersPerSec) * 1000))
}

/**
 * Finner nøyaktig posisjon og retning langs sporet gitt medgått tid (ms).
 */
export function interpolatePositionAtElapsedMs(
  points: TrackPoint[],
  elapsedMs: number,
  totalDurationMs?: number
): InterpolatedTrackPosition | null {
  if (!points || points.length < 2) return null

  const duration = totalDurationMs ?? getTrackDurationMs(points)
  const clampedElapsed = Math.max(0, Math.min(duration, elapsedMs))
  const progress = duration > 0 ? clampedElapsed / duration : 0

  // 1. Dersom sporet har tidsstempler, match på faktisk tidsstempel
  if (hasTrackTimestamps(points)) {
    const firstTime = points[0]!.timestamp!
    const targetTime = firstTime + clampedElapsed

    for (let i = 1; i < points.length; i++) {
      const pPrev = points[i - 1]!
      const pCurr = points[i]!
      const tPrev = pPrev.timestamp ?? firstTime
      const tCurr = pCurr.timestamp ?? firstTime

      if (tCurr >= targetTime || i === points.length - 1) {
        const segDuration = tCurr - tPrev
        const fraction = segDuration > 0 ? Math.max(0, Math.min(1, (targetTime - tPrev) / segDuration)) : 0
        const lat = pPrev.lat + fraction * (pCurr.lat - pPrev.lat)
        const lng = pPrev.lng + fraction * (pCurr.lng - pPrev.lng)
        const bearing = calculateBearingDegrees(pPrev.lat, pPrev.lng, pCurr.lat, pCurr.lng)

        return { lat, lng, bearing, progress }
      }
    }
  }

  // 2. Fallback for spor uten tidsstempler: match på distanse
  return interpolatePositionAtProgress(points, progress)
}

/**
 * Finner posisjon og retning langs sporet basert på en fremdriftsverdi fra 0.0 til 1.0.
 */
export function interpolatePositionAtProgress(
  points: TrackPoint[],
  progress: number
): InterpolatedTrackPosition | null {
  if (!points || points.length < 2) return null

  const clampedProgress = Math.max(0, Math.min(1, progress))
  if (clampedProgress === 0) {
    const p0 = points[0]!
    const p1 = points[1]!
    return {
      lat: p0.lat,
      lng: p0.lng,
      bearing: calculateBearingDegrees(p0.lat, p0.lng, p1.lat, p1.lng),
      progress: 0
    }
  }

  // Beregn akkumulerte avstander
  const dists: number[] = [0]
  let totalDist = 0
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1]!
    const p2 = points[i]!
    const d = calculateDistanceMeters(p1.lat, p1.lng, p2.lat, p2.lng)
    totalDist += d
    dists.push(totalDist)
  }

  if (totalDist === 0) {
    const p0 = points[0]!
    return { lat: p0.lat, lng: p0.lng, bearing: 0, progress: 0 }
  }

  const targetDist = clampedProgress * totalDist

  for (let i = 1; i < points.length; i++) {
    const dPrev = dists[i - 1]!
    const dCurr = dists[i]!

    if (dCurr >= targetDist || i === points.length - 1) {
      const segDist = dCurr - dPrev
      const fraction = segDist > 0 ? Math.max(0, Math.min(1, (targetDist - dPrev) / segDist)) : 0
      const pPrev = points[i - 1]!
      const pCurr = points[i]!

      const lat = pPrev.lat + fraction * (pCurr.lat - pPrev.lat)
      const lng = pPrev.lng + fraction * (pCurr.lng - pPrev.lng)
      const bearing = calculateBearingDegrees(pPrev.lat, pPrev.lng, pCurr.lat, pCurr.lng)

      return { lat, lng, bearing, progress: clampedProgress }
    }
  }

  const pLast = points[points.length - 1]!
  const pPenultimate = points[points.length - 2]!
  return {
    lat: pLast.lat,
    lng: pLast.lng,
    bearing: calculateBearingDegrees(pPenultimate.lat, pPenultimate.lng, pLast.lat, pLast.lng),
    progress: 1
  }
}
