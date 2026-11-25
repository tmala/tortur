import { shortestAngleDiff } from '@/utils/flyoverPath'

export type ElevationSampler = (lng: number, lat: number) => number | null

export interface ClearPitchOptions {
  minPitch?: number
  exaggeration?: number
  sampleDistancesMeters?: number[]
  clearanceMeters?: number
}

const EARTH_RADIUS_METERS = 6371000
const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

/**
 * Beregner ny bredde- og lengdegrad i en gitt kompassretning og avstand (meter).
 */
export function offsetLatLng(
  lat: number,
  lng: number,
  bearingDeg: number,
  distanceMeters: number,
): { lat: number; lng: number } {
  const rad = bearingDeg * DEG_TO_RAD
  const dLat = ((distanceMeters * Math.cos(rad)) / EARTH_RADIUS_METERS) * RAD_TO_DEG
  const cosLat = Math.max(0.01, Math.cos(lat * DEG_TO_RAD))
  const dLng = ((distanceMeters * Math.sin(rad)) / (EARTH_RADIUS_METERS * cosLat)) * RAD_TO_DEG

  return {
    lat: lat + dLat,
    lng: lng + dLng,
  }
}

/**
 * Finner den mest åpne kameraretningen (ser fra dalsiden inn mot fjellsiden) ved å
 * sample terrenghøyden i 8 retninger rundt markøren.
 * Faller tilbake til `fallbackBearing` på flatt terreng eller hvis høydedata mangler.
 */
export function computeOpenSideBearing(
  lat: number,
  lng: number,
  sampleElevation: ElevationSampler,
  fallbackBearing: number,
  sampleDistanceMeters = 260,
  minReliefMeters = 15,
): number {
  const samples: { angle: number; ele: number }[] = []

  for (let angle = 0; angle < 360; angle += 45) {
    const pt = offsetLatLng(lat, lng, angle, sampleDistanceMeters)
    const ele = sampleElevation(pt.lng, pt.lat)
    if (typeof ele === 'number' && Number.isFinite(ele)) {
      samples.push({ angle, ele })
    }
  }

  if (samples.length < 4) {
    return ((fallbackBearing % 360) + 360) % 360
  }

  let minEle = Infinity
  let maxEle = -Infinity
  let sumEle = 0

  for (const s of samples) {
    if (s.ele < minEle) minEle = s.ele
    if (s.ele > maxEle) maxEle = s.ele
    sumEle += s.ele
  }

  if (maxEle - minEle < minReliefMeters) {
    return ((fallbackBearing % 360) + 360) % 360
  }

  const meanEle = sumEle / samples.length
  let vx = 0
  let vy = 0

  for (const s of samples) {
    // Positiv vekt i retninger der terrenget ligger lavere enn gjennomsnittet (dalsiden)
    const drop = meanEle - s.ele
    const rad = s.angle * DEG_TO_RAD
    vx += drop * Math.sin(rad)
    vy += drop * Math.cos(rad)
  }

  if (Math.hypot(vx, vy) < 1e-3) {
    return ((fallbackBearing % 360) + 360) % 360
  }

  // Retningen mot dalen (der kameraet bør stå). Kameraet skal se i motsatt retning (inn mot fjellsiden).
  const valleyBearing = (Math.atan2(vx, vy) * RAD_TO_DEG + 360) % 360
  return (valleyBearing + 180) % 360
}

/**
 * Beregner sveip-retning som pendler mykt frem og tilbake rundt `baseBearing` med ±amplitudeDeg.
 */
export function computeSweepBearing(
  baseBearing: number,
  phaseRad: number,
  amplitudeDeg = 50,
): number {
  const offset = Math.sin(phaseRad) * amplitudeDeg
  return (((baseBearing + offset) % 360) + 360) % 360
}

/**
 * Sjekker siktlinjen mellom kameraet og markøren langs terrenget, og returnerer en
 * trygg pitch-verdi (lavere pitch = høyere kamera ovenfra) slik at terrenget ikke skjuler sporet.
 */
export function computeClearPitch(
  lat: number,
  lng: number,
  centerElevation: number | null,
  cameraBearing: number,
  desiredPitch: number,
  sampleElevation: ElevationSampler,
  options: ClearPitchOptions = {},
): number {
  const minPitch = options.minPitch ?? 24
  const exaggeration = options.exaggeration ?? 1.3
  const sampleDistances = options.sampleDistancesMeters ?? [90, 180, 300, 450]
  const clearanceMeters = options.clearanceMeters ?? 25

  const baseEle =
    typeof centerElevation === 'number' && Number.isFinite(centerElevation)
      ? centerElevation
      : sampleElevation(lng, lat)

  if (typeof baseEle !== 'number' || !Number.isFinite(baseEle)) {
    return desiredPitch
  }

  const z0 = baseEle * exaggeration
  const behindBearing = (cameraBearing + 180) % 360
  let maxAllowedPitch = desiredPitch

  for (const dist of sampleDistances) {
    if (dist <= 0) continue
    const pt = offsetLatLng(lat, lng, behindBearing, dist)
    const ele = sampleElevation(pt.lng, pt.lat)
    if (typeof ele !== 'number' || !Number.isFinite(ele)) continue

    const zTerrain = ele * exaggeration
    const requiredHeightAboveCenter = zTerrain + clearanceMeters - z0
    if (requiredHeightAboveCenter <= 0) continue

    const requiredElevationAngleDeg = Math.atan2(requiredHeightAboveCenter, dist) * RAD_TO_DEG
    const allowedPitch = 90 - requiredElevationAngleDeg
    if (allowedPitch < maxAllowedPitch) {
      maxAllowedPitch = allowedPitch
    }
  }

  return Math.max(minPitch, Math.min(desiredPitch, maxAllowedPitch))
}

/**
 * Rammefrekvens-uavhengig glatting av vinkler i grader (0-360°).
 */
export function dampAngle(
  currentDeg: number,
  targetDeg: number,
  dtSeconds: number,
  speed = 2.0,
): number {
  const dt = Math.max(0, dtSeconds)
  const alpha = 1 - Math.exp(-speed * dt)
  const diff = shortestAngleDiff(currentDeg, targetDeg)
  return (((currentDeg + diff * alpha) % 360) + 360) % 360
}

/**
 * Rammefrekvens-uavhengig glatting av skalarverdier (f.eks. pitch).
 */
export function dampValue(
  current: number,
  target: number,
  dtSeconds: number,
  speed = 3.5,
): number {
  const dt = Math.max(0, dtSeconds)
  const alpha = 1 - Math.exp(-speed * dt)
  return current + (target - current) * alpha
}
