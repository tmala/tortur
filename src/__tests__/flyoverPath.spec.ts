import { describe, it, expect } from 'vitest'
import {
  shortestAngleDiff,
  smoothAngles,
  prepareFlyoverPath,
  samplePathAtProgress
} from '../utils/flyoverPath'
import { parseGpx } from '../utils/gpxParser'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('flyoverPath', () => {
  describe('shortestAngleDiff', () => {
    it('beregner direkte differanse', () => {
      expect(shortestAngleDiff(10, 30)).toBe(20)
      expect(shortestAngleDiff(30, 10)).toBe(-20)
    })

    it('håndterer 360/0-kryssing korrekt', () => {
      expect(shortestAngleDiff(355, 5)).toBe(10)
      expect(shortestAngleDiff(5, 355)).toBe(-10)
      expect(shortestAngleDiff(350, 10)).toBe(20)
    })
  })

  describe('smoothAngles', () => {
    it('glatter vinkler over 0/360-grensen uten å gjøre 360-graders feilhopp', () => {
      const noisy = [350, 355, 0, 5, 10]
      const smoothed = smoothAngles(noisy, 1)
      expect(smoothed).toHaveLength(5)
      // Element ved index 2 (rundt 0) skal være nært 0/360, f.eks. 0
      expect(smoothed[2]).toBeCloseTo(0, 0)
    })
  })

  describe('prepareFlyoverPath', () => {
    it('håndterer tomme eller for korte spor', () => {
      const empty = prepareFlyoverPath([])
      expect(empty.points).toHaveLength(0)
      expect(empty.totalDistanceMeters).toBe(0)

      const single = prepareFlyoverPath([{ lat: 60.1, lng: 5.2 }])
      expect(single.points).toHaveLength(0)
    })

    it('prosesserer ekte Rollandsoksen GPX med høydedata', () => {
      const filePath = resolve(__dirname, '../../tracks/2026-09-04.gpx')
      const gpxContent = readFileSync(filePath, 'utf-8')
      const parsed = parseGpx(gpxContent)

      expect(parsed.points.length).toBeGreaterThan(100)
      expect(parsed.points[0]?.ele).toBeDefined()

      const path = prepareFlyoverPath(parsed.points, 10, 80)

      expect(path.totalDistanceMeters).toBeGreaterThan(3500)
      expect(path.totalDistanceMeters).toBeLessThan(4200)
      expect(path.points.length).toBeGreaterThan(300)
      expect(path.hasElevation).toBe(true)
      expect(path.minElevation).toBeDefined()
      expect(path.maxElevation).toBeDefined()
      expect(path.maxElevation!).toBeGreaterThan(path.minElevation!)

      // Startpunkt og sluttpunkt progress
      expect(path.points[0]!.progress).toBe(0)
      expect(path.points[path.points.length - 1]!.progress).toBe(1)
    })

    it('samplePathAtProgress gir jevne interpolerte punkter', () => {
      const filePath = resolve(__dirname, '../../tracks/2026-09-04.gpx')
      const gpxContent = readFileSync(filePath, 'utf-8')
      const parsed = parseGpx(gpxContent)
      const path = prepareFlyoverPath(parsed.points, 10, 80)

      const mid = samplePathAtProgress(path, 0.5)
      expect(mid.progress).toBe(0.5)
      expect(mid.distanceMeters).toBeCloseTo(path.totalDistanceMeters * 0.5, -1)
      expect(mid.ele).toBeDefined()
      expect(mid.bearing).toBeGreaterThanOrEqual(0)
      expect(mid.bearing).toBeLessThanOrEqual(360)

      const start = samplePathAtProgress(path, 0)
      expect(start.progress).toBe(0)
      expect(start.distanceMeters).toBe(0)

      const end = samplePathAtProgress(path, 1)
      expect(end.progress).toBe(1)
      expect(end.distanceMeters).toBe(path.totalDistanceMeters)
    })
  })
})
