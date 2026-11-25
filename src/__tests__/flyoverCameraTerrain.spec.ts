import { describe, it, expect } from 'vitest'
import {
  computeClearPitch,
  computeOpenSideBearing,
  computeSweepBearing,
  dampAngle,
  dampValue,
  offsetLatLng,
} from '@/utils/flyoverCameraTerrain'

describe('flyoverCameraTerrain', () => {
  describe('offsetLatLng', () => {
    it('flytter punktet nordover ved bearing 0 og østover ved bearing 90', () => {
      const north = offsetLatLng(60.4, 5.33, 0, 1000)
      expect(north.lat).toBeGreaterThan(60.4)
      expect(north.lng).toBeCloseTo(5.33, 5)

      const east = offsetLatLng(60.4, 5.33, 90, 1000)
      expect(east.lat).toBeCloseTo(60.4, 5)
      expect(east.lng).toBeGreaterThan(5.33)
    })
  })

  describe('computeOpenSideBearing', () => {
    it('velger å se inn mot fjellet fra den åpne dalsiden (høyt i øst, lavt i vest -> bearing ~90°)', () => {
      // Simulert Fløyen: høyden øker kraftig mot øst (høyere lng)
      const slopeEast = (lng: number) => 200 + (lng - 5.33) * 40000
      const bearing = computeOpenSideBearing(60.39, 5.33, slopeEast, 0)
      expect(bearing).toBeCloseTo(90, 0)
    })

    it('faller tilbake til fallbackBearing når terrenget er flatt eller høydedata mangler', () => {
      const flat = () => 150
      expect(computeOpenSideBearing(60.39, 5.33, flat, 135)).toBe(135)

      const unavailable = () => null
      expect(computeOpenSideBearing(60.39, 5.33, unavailable, 210)).toBe(210)
    })
  })

  describe('computeSweepBearing', () => {
    it('pendler symmetrisk innenfor ±50° rundt baseBearing', () => {
      expect(computeSweepBearing(90, 0, 50)).toBeCloseTo(90, 5)
      expect(computeSweepBearing(90, Math.PI / 2, 50)).toBeCloseTo(140, 5)
      expect(computeSweepBearing(90, (3 * Math.PI) / 2, 50)).toBeCloseTo(40, 5)
      // Wrap-around over 0°/360°
      expect(computeSweepBearing(10, (3 * Math.PI) / 2, 50)).toBeCloseTo(320, 5)
    })
  })

  describe('computeClearPitch', () => {
    it('beholder ønsket pitch når sikten bak kameraet er fri', () => {
      const flat = () => 100
      const pitch = computeClearPitch(60.39, 5.33, 100, 90, 58, flat)
      expect(pitch).toBe(58)
    })

    it('senker pitch (løfter kameraet) når en fjellrygg stikker opp mellom kameraet og sporet', () => {
      // Kamera ser østover (bearing 90°) -> kameraet er plassert vest for sporet (lavere lng).
      // Legg en bratt fjellrygg vest for sporet (+200 m høyere enn sporet).
      const ridgeBehind = (lng: number) => (lng < 5.329 ? 350 : 150)
      const pitch = computeClearPitch(60.39, 5.33, 150, 90, 65, ridgeBehind, {
        minPitch: 24,
        exaggeration: 1.3,
      })
      expect(pitch).toBeLessThan(45)
      expect(pitch).toBeGreaterThanOrEqual(24)
    })
  })

  describe('dampAngle & dampValue', () => {
    it('glatter vinkler korteste vei over 350° -> 10°', () => {
      const next = dampAngle(350, 10, 0.5, 2)
      expect(next > 350 || next < 10).toBe(true)
    })

    it('glatter skalarverdier jevnt mot målverdi', () => {
      const next = dampValue(65, 35, 0.2, 3.5)
      expect(next).toBeLessThan(65)
      expect(next).toBeGreaterThan(35)
    })
  })
})
