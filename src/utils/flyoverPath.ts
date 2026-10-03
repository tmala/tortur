import type { TrackPoint } from '@/composables/useGeolocation'
import { calculateDistanceMeters } from '@/composables/useGeolocation'
import { calculateBearingDegrees } from '@/utils/trackPlayback'

export interface FlyoverSamplePoint {
  lat: number
  lng: number
  ele?: number
  distanceMeters: number
  bearing: number
  progress: number // 0.0 to 1.0
}

export interface FlyoverPath {
  points: FlyoverSamplePoint[]
  totalDistanceMeters: number
  minElevation?: number
  maxElevation?: number
  elevationGainMeters?: number
  elevationLossMeters?: number
  hasElevation: boolean
  originalPointCount: number
}

/**
 * Beregner korteste vinkeldifferanse i grader (-180 til +180).
 */
export function shortestAngleDiff(fromDeg: number, toDeg: number): number {
  let diff = (toDeg - fromDeg) % 360
  if (diff < -180) diff += 360
  if (diff > 180) diff -= 360
  return diff
}

/**
 * Glatter en liste med vinkler i sirkulært domene ved hjelp av et glidende vindu.
 */
export function smoothAngles(angles: number[], windowRadius = 3): number[] {
  if (angles.length <= 1) return [...angles]
  const smoothed: number[] = []

  for (let i = 0; i < angles.length; i++) {
    const baseAngle = angles[i]!
    let totalOffset = 0
    let count = 0

    for (let j = Math.max(0, i - windowRadius); j <= Math.min(angles.length - 1, i + windowRadius); j++) {
      const target = angles[j]!
      totalOffset += shortestAngleDiff(baseAngle, target)
      count++
    }

    const avgOffset = totalOffset / count
    const finalAngle = (baseAngle + avgOffset + 360) % 360
    smoothed.push(finalAngle)
  }

  return smoothed
}

/**
 * Forbereder en jevnt samplet og kameratilpasset 3D-flyover-bane basert på rå TrackPoints.
 */
export function prepareFlyoverPath(
  rawPoints: TrackPoint[],
  sampleSpacingMeters = 8,
  lookaheadMeters = 70
): FlyoverPath {
  if (!rawPoints || rawPoints.length < 2) {
    return {
      points: [],
      totalDistanceMeters: 0,
      hasElevation: false,
      originalPointCount: rawPoints ? rawPoints.length : 0
    }
  }

  // 1. Beregn akkumulert distanse langs de rå punktene
  const cumDists: number[] = [0]
  let totalDist = 0
  for (let i = 1; i < rawPoints.length; i++) {
    const prev = rawPoints[i - 1]!
    const curr = rawPoints[i]!
    totalDist += calculateDistanceMeters(prev.lat, prev.lng, curr.lat, curr.lng)
    cumDists.push(totalDist)
  }

  if (totalDist <= 0) {
    const p0 = rawPoints[0]!
    return {
      points: [
        {
          lat: p0.lat,
          lng: p0.lng,
          ele: p0.ele,
          distanceMeters: 0,
          bearing: 0,
          progress: 0
        }
      ],
      totalDistanceMeters: 0,
      hasElevation: p0.ele !== undefined,
      originalPointCount: rawPoints.length
    }
  }

  // 2. Resample punkter ved faste intervaller (f.eks. hver 8. meter)
  const numSteps = Math.max(2, Math.ceil(totalDist / sampleSpacingMeters))
  const stepDist = totalDist / (numSteps - 1)

  interface TempPoint {
    lat: number
    lng: number
    ele?: number
    distanceMeters: number
    progress: number
  }

  const resampled: TempPoint[] = []
  let rawIdx = 1

  for (let s = 0; s < numSteps; s++) {
    const targetDist = Math.min(totalDist, s * stepDist)

    while (rawIdx < rawPoints.length - 1 && cumDists[rawIdx]! < targetDist) {
      rawIdx++
    }

    const pPrev = rawPoints[rawIdx - 1]!
    const pCurr = rawPoints[rawIdx]!
    const dPrev = cumDists[rawIdx - 1]!
    const dCurr = cumDists[rawIdx]!

    const segDist = dCurr - dPrev
    const t = segDist > 0 ? Math.max(0, Math.min(1, (targetDist - dPrev) / segDist)) : 0

    const lat = pPrev.lat + t * (pCurr.lat - pPrev.lat)
    const lng = pPrev.lng + t * (pCurr.lng - pPrev.lng)

    let ele: number | undefined
    if (pPrev.ele !== undefined && pCurr.ele !== undefined) {
      ele = pPrev.ele + t * (pCurr.ele - pPrev.ele)
    } else if (pCurr.ele !== undefined) {
      ele = pCurr.ele
    } else if (pPrev.ele !== undefined) {
      ele = pPrev.ele
    }

    resampled.push({
      lat,
      lng,
      ele,
      distanceMeters: targetDist,
      progress: targetDist / totalDist
    })
  }

  // 3. Beregn retning/kurs med lookahead for å gi et rolig og profesjonelt filmkamera
  const rawBearings: number[] = []
  const lookaheadSteps = Math.max(2, Math.round(lookaheadMeters / stepDist))

  for (let i = 0; i < resampled.length; i++) {
    const curr = resampled[i]!
    const forwardIdx = Math.min(resampled.length - 1, i + lookaheadSteps)
    const forward = resampled[forwardIdx]!

    if (forwardIdx > i) {
      rawBearings.push(calculateBearingDegrees(curr.lat, curr.lng, forward.lat, forward.lng))
    } else if (i > 0) {
      const prev = resampled[i - 1]!
      rawBearings.push(calculateBearingDegrees(prev.lat, prev.lng, curr.lat, curr.lng))
    } else {
      rawBearings.push(0)
    }
  }

  // 4. Glatt vinklene for å fjerne rykk ved krappe svinger
  const smoothedBearings = smoothAngles(rawBearings, 4)

  // 5. Bygg ferdige FlyoverSamplePoint
  let minElevation: number | undefined
  let maxElevation: number | undefined
  let elevationGainMeters = 0
  let elevationLossMeters = 0
  let hasElevation = false

  const finalPoints: FlyoverSamplePoint[] = resampled.map((pt, idx) => {
    if (pt.ele !== undefined) {
      hasElevation = true
      if (minElevation === undefined || pt.ele < minElevation) minElevation = pt.ele
      if (maxElevation === undefined || pt.ele > maxElevation) maxElevation = pt.ele

      if (idx > 0 && resampled[idx - 1]!.ele !== undefined) {
        const diff = pt.ele - resampled[idx - 1]!.ele!
        if (diff > 0) elevationGainMeters += diff
        else elevationLossMeters += Math.abs(diff)
      }
    }

    return {
      lat: pt.lat,
      lng: pt.lng,
      ele: pt.ele !== undefined ? Math.round(pt.ele * 10) / 10 : undefined,
      distanceMeters: Math.round(pt.distanceMeters),
      bearing: Math.round(smoothedBearings[idx]! * 10) / 10,
      progress: pt.progress
    }
  })

  return {
    points: finalPoints,
    totalDistanceMeters: Math.round(totalDist),
    minElevation: minElevation !== undefined ? Math.round(minElevation) : undefined,
    maxElevation: maxElevation !== undefined ? Math.round(maxElevation) : undefined,
    elevationGainMeters: hasElevation ? Math.round(elevationGainMeters) : undefined,
    elevationLossMeters: hasElevation ? Math.round(elevationLossMeters) : undefined,
    hasElevation,
    originalPointCount: rawPoints.length
  }
}

/**
 * Hurtigoppslag for å hente interpolert punkt langs banen basert på progress (0.0 til 1.0).
 */
export function samplePathAtProgress(path: FlyoverPath, progress: number): FlyoverSamplePoint {
  const pts = path.points
  if (pts.length === 0) {
    return { lat: 0, lng: 0, distanceMeters: 0, bearing: 0, progress: 0 }
  }
  if (pts.length === 1) {
    return pts[0]!
  }

  const p = Math.max(0, Math.min(1, progress))
  const targetDist = p * path.totalDistanceMeters

  // Binærsøk for O(log N) oppslag
  let low = 0
  let high = pts.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const midDist = pts[mid]!.distanceMeters

    if (midDist < targetDist) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  const idx = Math.max(1, Math.min(pts.length - 1, low))
  const p0 = pts[idx - 1]!
  const p1 = pts[idx]!

  const segDist = p1.distanceMeters - p0.distanceMeters
  const t = segDist > 0 ? Math.max(0, Math.min(1, (targetDist - p0.distanceMeters) / segDist)) : 0

  const lat = p0.lat + t * (p1.lat - p0.lat)
  const lng = p0.lng + t * (p1.lng - p0.lng)

  let ele: number | undefined
  if (p0.ele !== undefined && p1.ele !== undefined) {
    ele = p0.ele + t * (p1.ele - p0.ele)
  } else if (p1.ele !== undefined) {
    ele = p1.ele
  } else if (p0.ele !== undefined) {
    ele = p0.ele
  }

  // Sirkulær interpolasjon av peiling
  const angleDiff = shortestAngleDiff(p0.bearing, p1.bearing)
  const bearing = (p0.bearing + t * angleDiff + 360) % 360

  return {
    lat,
    lng,
    ele: ele !== undefined ? Math.round(ele * 10) / 10 : undefined,
    distanceMeters: Math.round(targetDist),
    bearing: Math.round(bearing * 10) / 10,
    progress: p
  }
}
