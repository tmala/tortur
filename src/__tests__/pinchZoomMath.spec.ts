import { describe, it, expect } from 'vitest'
import {
  clampPan,
  clampScale,
  computeMaxScale,
  getFullSizePhotoUrl,
  zoomAroundPoint,
} from '@/utils/pinchZoomMath'

describe('pinchZoomMath', () => {
  describe('clampScale', () => {
    it('begrenser skala mellom minScale og maxScale', () => {
      expect(clampScale(0.4, 1, 8)).toBe(1)
      expect(clampScale(2.5, 1, 8)).toBe(2.5)
      expect(clampScale(12, 1, 8)).toBe(8)
      expect(clampScale(Number.NaN, 1, 8)).toBe(1)
    })
  })

  describe('computeMaxScale', () => {
    it('returnerer minMaxScale når dimensjoner mangler eller er 0', () => {
      expect(computeMaxScale({ width: 0, height: 0 }, { width: 0, height: 0 }, 4, 8)).toBe(4)
    })

    it('beregner skala basert på forholdet mellom naturlig og vist størrelse opp til hardCapScale', () => {
      expect(computeMaxScale({ width: 400, height: 300 }, { width: 2000, height: 1500 }, 4, 8)).toBe(
        5,
      )
      expect(computeMaxScale({ width: 300, height: 200 }, { width: 4000, height: 3000 }, 4, 8)).toBe(
        8,
      )
      expect(computeMaxScale({ width: 800, height: 600 }, { width: 1000, height: 750 }, 4, 8)).toBe(
        4,
      )
    })
  })

  describe('zoomAroundPoint', () => {
    it('holder fokuspunktet i ro når man zoomer inn fra senter og fra et forskjøvet punkt', () => {
      const fromCenter = zoomAroundPoint({ scale: 1, tx: 0, ty: 0 }, 2, 0, 0, 1, 8)
      expect(fromCenter).toEqual({ scale: 2, tx: 0, ty: 0 })

      const fromOffset = zoomAroundPoint({ scale: 1, tx: 0, ty: 0 }, 2, 50, -30, 1, 8)
      expect(fromOffset).toEqual({ scale: 2, tx: -50, ty: 30 })
    })

    it('nullstiller tx og ty til 0 når skala zoomes tilbake til 1', () => {
      const resetState = zoomAroundPoint({ scale: 2.5, tx: -80, ty: 40 }, 1, 20, -10, 1, 8)
      expect(resetState).toEqual({ scale: 1, tx: 0, ty: 0 })
    })
  })

  describe('clampPan', () => {
    it('nullstiller panorering ved skala 1', () => {
      expect(
        clampPan({ scale: 1, tx: 100, ty: -50 }, { width: 400, height: 300 }, { width: 400, height: 300 }),
      ).toEqual({ scale: 1, tx: 0, ty: 0 })
    })

    it('begrenser panorering til bildets ytterkanter når bildet er zoomet inn', () => {
      // Bildet er 400x300, ved 2x er det 800x600 i en ramme på 400x300 -> maks utslag +-200 i X og +-150 i Y
      const clamped = clampPan(
        { scale: 2, tx: 350, ty: -250 },
        { width: 400, height: 300 },
        { width: 400, height: 300 },
      )
      expect(clamped).toEqual({ scale: 2, tx: 200, ty: -150 })
    })

    it('sentrerer på en akse dersom skalert bilde fortsatt er smalere enn rammen', () => {
      const clamped = clampPan(
        { scale: 1.5, tx: 80, ty: 100 },
        { width: 600, height: 400 },
        { width: 300, height: 400 },
      )
      // scaledW = 450 < 600 => maxTx = 0; scaledH = 600 > 400 => maxTy = 100
      expect(clamped).toEqual({ scale: 1.5, tx: 0, ty: 100 })
    })
  })

  describe('getFullSizePhotoUrl', () => {
    it('legger til =s0 på Google Drive lh3-lenker uten størrelsesparameter', () => {
      expect(getFullSizePhotoUrl('https://lh3.googleusercontent.com/d/abc123XYZ')).toBe(
        'https://lh3.googleusercontent.com/d/abc123XYZ=s0',
      )
      expect(getFullSizePhotoUrl({ url: 'https://lh3.googleusercontent.com/d/file_99=w600' })).toBe(
        'https://lh3.googleusercontent.com/d/file_99=s0',
      )
    })

    it('lar andre URL-er og tomme verdier være uendret', () => {
      expect(getFullSizePhotoUrl('https://example.com/photo.jpg')).toBe(
        'https://example.com/photo.jpg',
      )
      expect(getFullSizePhotoUrl('')).toBe('')
      expect(getFullSizePhotoUrl(null)).toBe('')
    })
  })
})
