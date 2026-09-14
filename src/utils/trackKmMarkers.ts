import type { TrackPoint } from '@/composables/useGeolocation'
import { calculateDistanceMeters } from '@/composables/useGeolocation'

export interface KmMarkerInfo {
  km: number // 1, 2, 3, ...
  lat: number
  lng: number
  splitMs?: number // Varighet for denne kilometeren i ms
  splitFormatted?: string // F.eks. "14:32" eller "1:05:10"
  splitDetailed?: string // F.eks. "14 min 32 sek"
  cumulativeMs?: number // Tid fra start i ms
  cumulativeDetailed?: string // F.eks. "45 min 10 sek"
}

/**
 * Formaterer en tidsperiode i ms til "M:SS" eller "H:MM:SS" (f.eks. "14:32" eller "1:05:12").
 */
export function formatSplitTime(ms?: number): string {
  if (ms == null || isNaN(ms) || ms < 0) return ''
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * Formaterer en tidsperiode i ms til lesbar norsk tekst (f.eks. "14 min 32 sek").
 */
export function formatDetailedTime(ms?: number): string {
  if (ms == null || isNaN(ms) || ms < 0) return ''
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours} t ${minutes} min ${seconds} sek`
  }
  if (minutes > 0) {
    return `${minutes} min ${seconds} sek`
  }
  return `${seconds} sek`
}

/**
 * Beregner posisjon og splittider for hver fullførte kilometer langs et GPS-spor.
 * Returnerer en tom liste dersom sporet er under 1000 meter.
 */
export function calculateKmMarkers(points: TrackPoint[] | undefined): KmMarkerInfo[] {
  if (!points || points.length < 2) return []

  const markers: KmMarkerInfo[] = []
  let accumulatedDist = 0
  let nextKmTarget = 1000

  const firstTimestamp = points[0]?.timestamp
  let prevKmTimestamp = firstTimestamp

  for (let i = 1; i < points.length; i++) {
    const pPrev = points[i - 1]
    const pCurr = points[i]
    if (!pPrev || !pCurr) continue

    const segDist = calculateDistanceMeters(pPrev.lat, pPrev.lng, pCurr.lat, pCurr.lng)
    if (segDist <= 0) continue

    const newAccumulated = accumulatedDist + segDist

    while (newAccumulated >= nextKmTarget) {
      const kmIndex = Math.round(nextKmTarget / 1000)
      const fraction = Math.max(0, Math.min(1, (nextKmTarget - accumulatedDist) / segDist))

      const lat = pPrev.lat + fraction * (pCurr.lat - pPrev.lat)
      const lng = pPrev.lng + fraction * (pCurr.lng - pPrev.lng)

      let currentKmTimestamp: number | undefined
      if (typeof pPrev.timestamp === 'number' && typeof pCurr.timestamp === 'number') {
        currentKmTimestamp = Math.round(
          pPrev.timestamp + fraction * (pCurr.timestamp - pPrev.timestamp)
        )
      } else if (typeof pCurr.timestamp === 'number') {
        currentKmTimestamp = pCurr.timestamp
      }

      let splitMs: number | undefined
      let splitFormatted: string | undefined
      let splitDetailed: string | undefined

      if (
        typeof currentKmTimestamp === 'number' &&
        typeof prevKmTimestamp === 'number' &&
        currentKmTimestamp >= prevKmTimestamp
      ) {
        splitMs = currentKmTimestamp - prevKmTimestamp
        splitFormatted = formatSplitTime(splitMs)
        splitDetailed = formatDetailedTime(splitMs)
      }

      let cumulativeMs: number | undefined
      let cumulativeDetailed: string | undefined
      if (
        typeof currentKmTimestamp === 'number' &&
        typeof firstTimestamp === 'number' &&
        currentKmTimestamp >= firstTimestamp
      ) {
        cumulativeMs = currentKmTimestamp - firstTimestamp
        cumulativeDetailed = formatDetailedTime(cumulativeMs)
      }

      markers.push({
        km: kmIndex,
        lat,
        lng,
        splitMs,
        splitFormatted,
        splitDetailed,
        cumulativeMs,
        cumulativeDetailed
      })

      if (typeof currentKmTimestamp === 'number') {
        prevKmTimestamp = currentKmTimestamp
      }
      nextKmTarget += 1000
    }

    accumulatedDist = newAccumulated
  }

  return markers
}
