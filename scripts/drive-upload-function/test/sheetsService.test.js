import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { isValidUserId, cellToString } from '../src/userId.js'
import {
  isEmailWhitelistedInSheet,
  isUserAuthorizedForUpload,
  _clearWhitelistCache
} from '../src/sheetsService.js'

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

describe('whitelist og fallback til regneark for bildeopplasting', () => {
  beforeEach(() => {
    _clearWhitelistCache()
  })

  test('isEmailWhitelistedInSheet finner registrert e-post i kolonne C', async () => {
    let callCount = 0
    const mockSheets = {
      spreadsheets: {
        values: {
          get: async ({ spreadsheetId, range }) => {
            callCount++
            assert.equal(spreadsheetId, 'sheet_123')
            assert.equal(range, 'Brukere!C:C')
            return {
              data: {
                values: [
                  ['E-post'],
                  ['Trillebar@gmail.com'],
                  ['daopheim@gmail.com'],
                  ['malitomi71@gmail.com ']
                ]
              }
            }
          }
        }
      }
    }

    const res = await isEmailWhitelistedInSheet({
      sheets: mockSheets,
      spreadsheetId: 'sheet_123',
      sheetBrukere: 'Brukere',
      email: 'Malitomi71@gmail.com'
    })

    assert.equal(res, true)
    assert.equal(callCount, 1)

    // Andre oppslag skal treffe in-memory cache og ikke kalle Sheets API på nytt
    const cachedRes = await isEmailWhitelistedInSheet({
      sheets: mockSheets,
      spreadsheetId: 'sheet_123',
      sheetBrukere: 'Brukere',
      email: 'malitomi71@gmail.com'
    })

    assert.equal(cachedRes, true)
    assert.equal(callCount, 1, 'Skal gjenbruke cachet positivt resultat uten nytt Sheets-kall')
  })

  test('isEmailWhitelistedInSheet returnerer false når e-post ikke finnes', async () => {
    const mockSheets = {
      spreadsheets: {
        values: {
          get: async () => ({
            data: {
              values: [
                ['E-post'],
                ['trillebar@gmail.com']
              ]
            }
          })
        }
      }
    }

    const res = await isEmailWhitelistedInSheet({
      sheets: mockSheets,
      spreadsheetId: 'sheet_123',
      sheetBrukere: 'Brukere',
      email: 'ukjent.bruker@gmail.com'
    })

    assert.equal(res, false)
  })

  test('isEmailWhitelistedInSheet håndterer feil fra Sheets API fail-closed', async () => {
    const mockSheets = {
      spreadsheets: {
        values: {
          get: async () => {
            throw new Error('Sheets API kvote overskredet')
          }
        }
      }
    }

    const res = await isEmailWhitelistedInSheet({
      sheets: mockSheets,
      spreadsheetId: 'sheet_123',
      sheetBrukere: 'Brukere',
      email: 'bruker@gmail.com'
    })

    assert.equal(res, false)
  })

  test('isUserAuthorizedForUpload bruker rask vei når e-post finnes i ALLOWED_EMAILS', async () => {
    let sheetsCalled = false
    const mockSheets = {
      spreadsheets: {
        values: {
          get: async () => {
            sheetsCalled = true
            return { data: { values: [] } }
          }
        }
      }
    }

    const res = await isUserAuthorizedForUpload({
      email: 'fast@gmail.com',
      allowedRaw: 'trillebar@gmail.com, fast@gmail.com, btskei@gmail.com',
      sheets: mockSheets,
      spreadsheetId: 'sheet_123'
    })

    assert.equal(res, true)
    assert.equal(sheetsCalled, false, 'Skal ikke kalle Sheets API når brukeren finnes i ALLOWED_EMAILS')
  })

  test('isUserAuthorizedForUpload faller tilbake til Sheets når bruker mangler i ALLOWED_EMAILS', async () => {
    let sheetsCalled = false
    const mockSheets = {
      spreadsheets: {
        values: {
          get: async () => {
            sheetsCalled = true
            return {
              data: {
                values: [['E-post'], ['ny.bruker@gmail.com']]
              }
            }
          }
        }
      }
    }

    const res = await isUserAuthorizedForUpload({
      email: 'Ny.Bruker@gmail.com',
      allowedRaw: 'trillebar@gmail.com btskei@gmail.com',
      sheets: mockSheets,
      spreadsheetId: 'sheet_123'
    })

    assert.equal(res, true)
    assert.equal(sheetsCalled, true, 'Skal konsultere Sheets API når e-post mangler i ALLOWED_EMAILS')
  })

  test('isUserAuthorizedForUpload konsulterer alltid Sheets når ALLOWED_EMAILS er tom', async () => {
    let sheetsCalled = false
    const mockSheets = {
      spreadsheets: {
        values: {
          get: async () => {
            sheetsCalled = true
            return {
              data: {
                values: [['E-post'], ['bruker@gmail.com']]
              }
            }
          }
        }
      }
    }

    const resEmptyString = await isUserAuthorizedForUpload({
      email: 'bruker@gmail.com',
      allowedRaw: '   ',
      sheets: mockSheets,
      spreadsheetId: 'sheet_123'
    })
    assert.equal(resEmptyString, true)
    assert.equal(sheetsCalled, true)

    _clearWhitelistCache()
    sheetsCalled = false

    const resUndefined = await isUserAuthorizedForUpload({
      email: 'bruker@gmail.com',
      allowedRaw: undefined,
      sheets: mockSheets,
      spreadsheetId: 'sheet_123'
    })
    assert.equal(resUndefined, true)
    assert.equal(sheetsCalled, true)
  })

  test('isUserAuthorizedForUpload avviser når verken ALLOWED_EMAILS eller Sheets matcher', async () => {
    const mockSheets = {
      spreadsheets: {
        values: {
          get: async () => ({
            data: {
              values: [['E-post'], ['andre@gmail.com']]
            }
          })
        }
      }
    }

    const res = await isUserAuthorizedForUpload({
      email: 'ikke.godkjent@gmail.com',
      allowedRaw: 'en@gmail.com to@gmail.com',
      sheets: mockSheets,
      spreadsheetId: 'sheet_123'
    })

    assert.equal(res, false)
  })
})

