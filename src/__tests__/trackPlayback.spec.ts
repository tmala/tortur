import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  calculateBearingDegrees,
  hasTrackTimestamps,
  getTrackDurationMs,
  interpolatePositionAtProgress,
  interpolatePositionAtElapsedMs,
  formatPlaybackTime,
  formatClockTime
} from '../utils/trackPlayback'
import { parseGpx } from '../utils/gpxParser'
import type { TrackPoint } from '../composables/useGeolocation'

describe('trackPlayback', () => {
  describe('calculateBearingDegrees', () => {
    it('beregner 0 grader for bevegelse rett nordover', () => {
      const bearing = calculateBearingDegrees(60.0, 5.0, 61.0, 5.0)
      expect(bearing).toBeCloseTo(0, 0)
    })

    it('beregner 90 grader for bevegelse rett østover ved ekvator', () => {
      const bearing = calculateBearingDegrees(0.0, 0.0, 0.0, 1.0)
      expect(bearing).toBeCloseTo(90, 0)
    })

    it('beregner 180 grader for bevegelse rett sørover', () => {
      const bearing = calculateBearingDegrees(61.0, 5.0, 60.0, 5.0)
      expect(bearing).toBeCloseTo(180, 0)
    })

    it('beregner 270 grader for bevegelse rett vestover ved ekvator', () => {
      const bearing = calculateBearingDegrees(0.0, 1.0, 0.0, 0.0)
      expect(bearing).toBeCloseTo(270, 0)
    })

    it('returnerer 0 for identiske koordinater', () => {
      expect(calculateBearingDegrees(60.0, 5.0, 60.0, 5.0)).toBe(0)
    })
  })

  describe('hasTrackTimestamps & getTrackDurationMs', () => {
    it('oppdager spor med og uten tidsstempler', () => {
      const withTimes: TrackPoint[] = [
        { lat: 60.0, lng: 5.0, timestamp: 1000 },
        { lat: 60.1, lng: 5.0, timestamp: 60000 }
      ]
      expect(hasTrackTimestamps(withTimes)).toBe(true)
      expect(getTrackDurationMs(withTimes)).toBe(59000)

      const withoutTimes: TrackPoint[] = [
        { lat: 60.0, lng: 5.0 },
        { lat: 60.01, lng: 5.0 }
      ]
      expect(hasTrackTimestamps(withoutTimes)).toBe(false)
      expect(getTrackDurationMs(withoutTimes)).toBeGreaterThan(1000)
    })
  })

  describe('interpolatePositionAtProgress & interpolatePositionAtElapsedMs', () => {
    const testPoints: TrackPoint[] = [
      { lat: 60.0000, lng: 5.0000, timestamp: 10000 },
      { lat: 60.0100, lng: 5.0000, timestamp: 20000 },
      { lat: 60.0100, lng: 5.0200, timestamp: 30000 }
    ]

    it('finner startpunkt ved progress 0', () => {
      const pos = interpolatePositionAtProgress(testPoints, 0)
      expect(pos).not.toBeNull()
      expect(pos!.lat).toBeCloseTo(60.0000, 4)
      expect(pos!.lng).toBeCloseTo(5.0000, 4)
      expect(pos!.progress).toBe(0)
    })

    it('finner sluttpunkt ved progress 1', () => {
      const pos = interpolatePositionAtProgress(testPoints, 1)
      expect(pos).not.toBeNull()
      expect(pos!.lat).toBeCloseTo(60.0100, 4)
      expect(pos!.lng).toBeCloseTo(5.0200, 4)
      expect(pos!.progress).toBe(1)
    })

    it('interpolerer posisjon og retning basert på elapsedMs', () => {
      // Halvveis i første segment (15000ms => 5000ms elapsed)
      const pos = interpolatePositionAtElapsedMs(testPoints, 5000, 20000)
      expect(pos).not.toBeNull()
      expect(pos!.lat).toBeCloseTo(60.0050, 4)
      expect(pos!.lng).toBeCloseTo(5.0000, 4)
      expect(pos!.bearing).toBeCloseTo(0, 0) // beveget seg nordover
      expect(pos!.timestamp).toBe(15000)
    })

    it('spiller av ekte Rollandsoksen GPX (3.8 km)', () => {
      const filePath = resolve(__dirname, '../../tracks/2026-09-04.gpx')
      const xml = readFileSync(filePath, 'utf-8')
      const parsed = parseGpx(xml)

      const duration = getTrackDurationMs(parsed.points)
      expect(duration).toBeGreaterThan(60000)

      // Start
      const posStart = interpolatePositionAtElapsedMs(parsed.points, 0, duration)
      expect(posStart).not.toBeNull()
      expect(posStart!.lat).toBeCloseTo(parsed.points[0]!.lat, 4)
      expect(posStart!.timestamp).toBe(parsed.points[0]!.timestamp)

      // Midtveis
      const posMid = interpolatePositionAtElapsedMs(parsed.points, duration / 2, duration)
      expect(posMid).not.toBeNull()
      expect(posMid!.lat).toBeGreaterThan(60.4)
      expect(posMid!.lng).toBeGreaterThan(5.3)

      // Slutt
      const posEnd = interpolatePositionAtElapsedMs(parsed.points, duration, duration)
      expect(posEnd).not.toBeNull()
      const lastPoint = parsed.points[parsed.points.length - 1]!
      expect(posEnd!.lat).toBeCloseTo(lastPoint.lat, 4)
    })
  })

  describe('formatPlaybackTime', () => {
    it('formaterer 0 ms eller ugyldige verdier som 0:00', () => {
      expect(formatPlaybackTime(0)).toBe('0:00')
      expect(formatPlaybackTime(-100)).toBe('0:00')
      expect(formatPlaybackTime(NaN)).toBe('0:00')
    })

    it('formaterer sekunder og minutter korrekt (m:ss)', () => {
      expect(formatPlaybackTime(5000)).toBe('0:05')
      expect(formatPlaybackTime(59000)).toBe('0:59')
      expect(formatPlaybackTime(60000)).toBe('1:00')
      expect(formatPlaybackTime(75000)).toBe('1:15')
      expect(formatPlaybackTime(599000)).toBe('9:59')
      expect(formatPlaybackTime(600000)).toBe('10:00')
      expect(formatPlaybackTime(3599000)).toBe('59:59')
    })

    it('formaterer timer korrekt (h:mm:ss)', () => {
      expect(formatPlaybackTime(3600000)).toBe('1:00:00')
      expect(formatPlaybackTime(3665000)).toBe('1:01:05')
      expect(formatPlaybackTime(16382000)).toBe('4:33:02')
    })
  })

  describe('formatClockTime', () => {
    it('formaterer timestamp til klokkeslett-streng', () => {
      // 2026-10-01T10:23:45Z
      const date = new Date('2026-10-01T12:00:00.000Z')
      const res = formatClockTime(date.getTime(), true)
      expect(res).toMatch(/^\d{2}:\d{2}:\d{2}$/)

      const resNoSec = formatClockTime(date.getTime(), false)
      expect(resNoSec).toMatch(/^\d{2}:\d{2}$/)
    })

    it('returnerer tom streng for 0 eller ugyldig timestamp', () => {
      expect(formatClockTime(0)).toBe('')
      expect(formatClockTime(NaN)).toBe('')
    })
  })
})
