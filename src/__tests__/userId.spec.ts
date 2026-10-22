import { describe, it, expect } from 'vitest'
import { isValidUserId, normalizeUserId } from '../utils/userId'

describe('userId hjelpefunksjoner', () => {
  describe('isValidUserId', () => {
    it('returnerer true for gyldige numeriske Google sub-strenger og test-IDer', () => {
      expect(isValidUserId('112512738037284113785')).toBe(true)
      expect(isValidUserId('  123456789012345678901  ')).toBe(true)
      expect(isValidUserId('0')).toBe(true)
      expect(isValidUserId('test_user_1')).toBe(true)
      expect(isValidUserId('user-abc')).toBe(true)
    })

    it('avviser tall som har mistet presisjon', () => {
      expect(isValidUserId(112512738037284110000)).toBe(false)
      expect(isValidUserId(12345)).toBe(false)
    })

    it('avviser tomme strenger eller whitespace', () => {
      expect(isValidUserId('')).toBe(false)
      expect(isValidUserId('   ')).toBe(false)
    })

    it('avviser vitenskapelig notasjon av avrundede tall og ugyldige tegn', () => {
      expect(isValidUserId('1.12513E+20')).toBe(false)
      expect(isValidUserId('1,12513E+20')).toBe(false)
      expect(isValidUserId('ola@example.com')).toBe(false)
      expect(isValidUserId('user!id')).toBe(false)
    })

    it('avviser null, undefined, objekter og booleans', () => {
      expect(isValidUserId(null)).toBe(false)
      expect(isValidUserId(undefined)).toBe(false)
      expect(isValidUserId({})).toBe(false)
      expect(isValidUserId(true)).toBe(false)
    })
  })

  describe('normalizeUserId', () => {
    it('trimmer og returnerer gyldig numerisk streng og test-IDer', () => {
      expect(normalizeUserId('112512738037284113785')).toBe('112512738037284113785')
      expect(normalizeUserId('  112512738037284113785  ')).toBe('112512738037284113785')
      expect(normalizeUserId('  test_user_1  ')).toBe('test_user_1')
    })

    it('returnerer tom streng for ugyldige verdier og tall', () => {
      expect(normalizeUserId(112512738037284110000)).toBe('')
      expect(normalizeUserId('1.12513E+20')).toBe('')
      expect(normalizeUserId('1,12513E+20')).toBe('')
      expect(normalizeUserId('ola@example.com')).toBe('')
      expect(normalizeUserId('')).toBe('')
      expect(normalizeUserId(null)).toBe('')
      expect(normalizeUserId(undefined)).toBe('')
    })
  })
})
