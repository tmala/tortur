import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { isValidUserId, cellToString } from '../src/userId.js'

describe('sheetsService userId og RAW-sikkerhet', () => {
  test('isValidUserId godkjenner kun strenger med sifre', () => {
    assert.equal(isValidUserId('112512738037284113785'), true)
    assert.equal(isValidUserId('  12345  '), true)
    assert.equal(isValidUserId('0'), true)

    // Ikke-streng eller ugyldige tegn
    assert.equal(isValidUserId(112512738037284110000), false)
    assert.equal(isValidUserId(''), false)
    assert.equal(isValidUserId('   '), false)
    assert.equal(isValidUserId('user@example.com'), false)
    assert.equal(isValidUserId('1.12513E+20'), false)
    assert.equal(isValidUserId('abc123'), false)
    assert.equal(isValidUserId(null), false)
    assert.equal(isValidUserId(undefined), false)
  })

  test('cellToString filtrerer bort vitenskapelig notasjon av avrundede tall', () => {
    assert.equal(cellToString('112512738037284113785'), '112512738037284113785')
    assert.equal(cellToString('Vanlig tekst'), 'Vanlig tekst')
    assert.equal(cellToString('1.12513E+20'), '')
    assert.equal(cellToString('1,12513E+20'), '')
    assert.equal(cellToString(null), '')
    assert.equal(cellToString(undefined), '')
  })
})
