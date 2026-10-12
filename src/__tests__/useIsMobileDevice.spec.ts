import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useIsMobileDevice } from '@/composables/useIsMobileDevice'

describe('useIsMobileDevice', () => {
  const originalUserAgent = navigator.userAgent
  const originalMaxTouchPoints = navigator.maxTouchPoints

  beforeEach(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 0,
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: originalMaxTouchPoints,
      configurable: true,
      writable: true,
    })
  })

  it('detekterer Android-enheter som mobil', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      configurable: true,
    })
    const { isMobileDevice } = useIsMobileDevice()
    expect(isMobileDevice.value).toBe(true)
  })

  it('detekterer iPhone som mobil', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
      configurable: true,
    })
    const { isMobileDevice } = useIsMobileDevice()
    expect(isMobileDevice.value).toBe(true)
  })

  it('detekterer iPad med iPadOS (Macintosh UA og touch points)', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      configurable: true,
    })
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 5,
      configurable: true,
    })
    const { isMobileDevice } = useIsMobileDevice()
    expect(isMobileDevice.value).toBe(true)
  })

  it('detekterer vanlig Mac/PC desktop som ikke-mobil', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    })
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 0,
      configurable: true,
    })
    const { isMobileDevice } = useIsMobileDevice()
    expect(isMobileDevice.value).toBe(false)
  })

  it('detekterer Windows desktop som ikke-mobil', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    })
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 0,
      configurable: true,
    })
    const { isMobileDevice } = useIsMobileDevice()
    expect(isMobileDevice.value).toBe(false)
  })
})
