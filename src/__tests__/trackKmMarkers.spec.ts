import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  calculateKmMarkers,
  formatSplitTime,
  formatDetailedTime
} from '../utils/trackKmMarkers'
import { parseGpx } from '../utils/gpxParser'
import type { TrackPoint } from '../composables/useGeolocation'

describe('trackKmMarkers', () => {
  describe('formatSplitTime & formatDetailedTime', () => {
    it('formaterer minutter og sekunder korrekt', () => {
      expect(formatSplitTime(14 * 60 * 1000 + 32 * 1000)).toBe('14:32')
      expect(formatSplitTime(5 * 60 * 1000 + 4 * 1000)).toBe('5:04')
      expect(formatSplitTime(0)).toBe('0:00')
      expect(formatSplitTime(undefined)).toBe('')
    })

    it('formaterer over 1 time med timer:minutter:sekunder', () => {
      const ms = 1 * 3600 * 1000 + 5 * 60 * 1000 + 12 * 1000
      expect(formatSplitTime(ms)).toBe('1:05:12')
    })

    it('formaterer detaljert norsk tekst', () => {
      expect(formatDetailedTime(14 * 60 * 1000 + 32 * 1000)).toBe('14 min 32 sek')
      expect(formatDetailedTime(45 * 1000)).toBe('45 sek')
      const msLong = 1 * 3600 * 1000 + 10 * 60 * 1000 + 5 * 1000
      expect(formatDetailedTime(msLong)).toBe('1 t 10 min 5 sek')
    })
  })

  describe('calculateKmMarkers', () => {
    it('returnerer tom liste for spor under 1 km eller tomme datasett', () => {
      expect(calculateKmMarkers(undefined)).toEqual([])
      expect(calculateKmMarkers([])).toEqual([])
      expect(calculateKmMarkers([{ lat: 60.39, lng: 5.32 }])).toEqual([])

      // To punkter ca. 300 meter fra hverandre
      const shortTrack: TrackPoint[] = [
        { lat: 60.3900, lng: 5.3200, timestamp: 1000 },
        { lat: 60.3920, lng: 5.3220, timestamp: 60000 }
      ]
      expect(calculateKmMarkers(shortTrack)).toEqual([])
    })

    it('beregner 1 markør med korrekt splittid for et spor på 1.5 km', () => {
      // Bergen: 1 grad lat er ca. 111.3 km -> 0.01 grad lat er ca. 1113 meter
      const startTime = Date.parse('2026-09-04T10:00:00Z')
      const endTime = Date.parse('2026-09-04T10:15:00Z') // 15 minutter totalt

      const points: TrackPoint[] = [
        { lat: 60.0000, lng: 5.0000, timestamp: startTime },
        { lat: 60.0135, lng: 5.0000, timestamp: endTime } // ca. 1500m nordover
      ]

      const markers = calculateKmMarkers(points)
      expect(markers.length).toBe(1)
      expect(markers[0]!.km).toBe(1)
      expect(markers[0]!.lat).toBeGreaterThan(60.008)
      expect(markers[0]!.lat).toBeLessThan(60.010)
      expect(markers[0]!.splitFormatted).toBeDefined()
      expect(markers[0]!.splitMs).toBeGreaterThan(0)
      expect(markers[0]!.cumulativeDetailed).toBeDefined()
    })

    it('beregner 3 markører for Rollandsoksen GPX (3.8 km)', () => {
      const filePath = resolve(__dirname, '../../tracks/2026-09-04.gpx')
      const xml = readFileSync(filePath, 'utf-8')
      const parsed = parseGpx(xml)

      const markers = calculateKmMarkers(parsed.points)
      // 3.8 km skal gi markører for 1 km, 2 km og 3 km
      expect(markers.length).toBe(3)

      expect(markers[0]!.km).toBe(1)
      expect(markers[1]!.km).toBe(2)
      expect(markers[2]!.km).toBe(3)

      for (const m of markers) {
        expect(m.lat).toBeGreaterThan(60.4)
        expect(m.lng).toBeGreaterThan(5.3)
        expect(m.splitFormatted).toBeTruthy()
        expect(m.splitDetailed).toBeTruthy()
        expect(m.cumulativeDetailed).toBeTruthy()
      }

      // Splittid for 1. km bør være rimelig (f.eks. mellom 5 og 25 min)
      expect(markers[0]!.splitMs).toBeGreaterThan(300 * 1000)
      expect(markers[0]!.splitMs).toBeLessThan(1800 * 1000)
    })

    it('håndterer spor uten tidsstempler uten å krasje', () => {
      const points: TrackPoint[] = [
        { lat: 60.0000, lng: 5.0000 },
        { lat: 60.0200, lng: 5.0000 } // ca. 2.2 km
      ]

      const markers = calculateKmMarkers(points)
      expect(markers.length).toBe(2)
      expect(markers[0]!.km).toBe(1)
      expect(markers[1]!.km).toBe(2)
      expect(markers[0]!.splitFormatted).toBeUndefined()
      expect(markers[1]!.splitFormatted).toBeUndefined()
    })
  })
})
