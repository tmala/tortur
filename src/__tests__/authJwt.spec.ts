import { describe, it, expect, vi } from 'vitest'
import { isJwtExpired, signInWithGoogleIdToken } from '../services/firebase'

describe('isJwtExpired', () => {
  function createTestJwt(expSecondsFromNow: number): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow
    const payload = btoa(JSON.stringify({ sub: '12345', exp }))
    const signature = 'mockSignature'
    return `${header}.${payload}.${signature}`
  }

  it('returns true for null, undefined or empty string', () => {
    expect(isJwtExpired(null)).toBe(true)
    expect(isJwtExpired(undefined)).toBe(true)
    expect(isJwtExpired('')).toBe(true)
  })

  it('returns true for malformed tokens', () => {
    expect(isJwtExpired('not-a-jwt')).toBe(true)
    expect(isJwtExpired('part1.part2')).toBe(true)
    expect(isJwtExpired('part1.part2.part3.part4')).toBe(true)
  })

  it('returns true for expired tokens', () => {
    const expiredToken = createTestJwt(-3600) // 1 hour in the past
    expect(isJwtExpired(expiredToken)).toBe(true)
  })

  it('returns true for tokens that expire within the 30-second buffer', () => {
    const almostExpiredToken = createTestJwt(10) // 10 seconds remaining (< 30s buffer)
    expect(isJwtExpired(almostExpiredToken)).toBe(true)
  })

  it('returns false for fresh tokens with plenty of remaining time', () => {
    const validToken = createTestJwt(3600) // 1 hour remaining
    expect(isJwtExpired(validToken)).toBe(false)
  })

  it('returns false if payload has no exp field', () => {
    const header = btoa(JSON.stringify({ alg: 'none' }))
    const payload = btoa(JSON.stringify({ sub: 'user_without_exp' }))
    const token = `${header}.${payload}.sig`
    expect(isJwtExpired(token)).toBe(false)
  })
})

describe('signInWithGoogleIdToken', () => {
  it('aborts early and returns null without network call if token is expired', async () => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const exp = Math.floor(Date.now() / 1000) - 3600
    const payload = btoa(JSON.stringify({ sub: 'expired_user', exp }))
    const expiredToken = `${header}.${payload}.sig`

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await signInWithGoogleIdToken(expiredToken)
    expect(result).toBeNull()
    warnSpy.mockRestore()
  })
})
