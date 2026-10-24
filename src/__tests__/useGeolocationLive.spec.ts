import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { useGeolocation } from '@/composables/useGeolocation'
import HeaderActionsDropdown from '@/components/header/HeaderActionsDropdown.vue'

describe('useGeolocation live location & heading', () => {
  let mockWatchPosition: ReturnType<typeof vi.fn>
  let mockClearWatch: ReturnType<typeof vi.fn>
  let mockGetCurrentPosition: ReturnType<typeof vi.fn>
  let watchSuccessCallback: ((pos: GeolocationPosition) => void) | null = null

  beforeEach(() => {
    localStorage.clear()
    watchSuccessCallback = null

    mockWatchPosition = vi.fn((success) => {
      watchSuccessCallback = success
      return 123
    })
    mockClearWatch = vi.fn()
    mockGetCurrentPosition = vi.fn((success) => {
      success({
        coords: {
          latitude: 60.3913,
          longitude: 5.3221,
          accuracy: 10,
          heading: 180,
          speed: 1.2,
          altitude: 45,
        },
        timestamp: Date.now(),
      } as GeolocationPosition)
    })

    vi.stubGlobal('navigator', {
      geolocation: {
        watchPosition: mockWatchPosition,
        clearWatch: mockClearWatch,
        getCurrentPosition: mockGetCurrentPosition,
      },
    })
  })

  it('startLiveLocating starter posisjonsovervåking uten å lagre punkter til sporlogg', () => {
    const { isLiveLocating, isTracking, trackPoints, coords, startLiveLocating } = useGeolocation()

    expect(isLiveLocating.value).toBe(false)
    expect(isTracking.value).toBe(false)

    startLiveLocating({ enableHighAccuracy: true })

    expect(isLiveLocating.value).toBe(true)
    expect(mockWatchPosition).toHaveBeenCalledTimes(1)

    // Simuler at en ny posisjon tikker inn fra GPS med heading
    if (watchSuccessCallback) {
      watchSuccessCallback({
        coords: {
          latitude: 60.392,
          longitude: 5.325,
          accuracy: 8,
          heading: 90,
          speed: 1.5,
          altitude: 50,
        },
        timestamp: 1700000000000,
      } as GeolocationPosition)
    }

    expect(coords.value?.lat).toBe(60.392)
    expect(coords.value?.lng).toBe(5.325)
    expect(coords.value?.heading).toBe(90)

    // Verifiser at sporet IKKE inneholder punkter fordi isTracking er false
    expect(trackPoints.value).toHaveLength(0)
  })

  it('stopLiveLocating stopper overvåking og kaller clearWatch dersom sporing ikke er aktiv', () => {
    const { isLiveLocating, startLiveLocating, stopLiveLocating } = useGeolocation()

    startLiveLocating()
    expect(isLiveLocating.value).toBe(true)

    stopLiveLocating()
    expect(isLiveLocating.value).toBe(false)
    expect(mockClearWatch).toHaveBeenCalledWith(123)
  })

  it('toggleLiveLocating veksler mellom på og av', () => {
    const { isLiveLocating, toggleLiveLocating } = useGeolocation()

    expect(isLiveLocating.value).toBe(false)
    toggleLiveLocating()
    expect(isLiveLocating.value).toBe(true)

    toggleLiveLocating()
    expect(isLiveLocating.value).toBe(false)
  })

  it('beholder watchPosition i gang hvis Spor meg (isTracking) fortsatt er aktiv når liveLocating stoppes', () => {
    const { isLiveLocating, isTracking, startLiveLocating, stopLiveLocating, startTracking } = useGeolocation()

    startLiveLocating()
    startTracking()

    expect(isLiveLocating.value).toBe(true)
    expect(isTracking.value).toBe(true)

    // Stopp "Hvor er jeg" – sporingen skal fortsette
    stopLiveLocating()
    expect(isLiveLocating.value).toBe(false)
    expect(isTracking.value).toBe(true)
    expect(mockClearWatch).not.toHaveBeenCalled()
  })

  it('viser aktiv tilstand og puls-effekt på Hvor er jeg-knappen i HeaderActionsDropdown', () => {
    const wrapper = mount(HeaderActionsDropdown, {
      props: {
        isOpen: true,
        isLiveLocating: true,
        isLocating: false,
      },
    })

    const locateBtn = wrapper.find('.btn-locate')
    expect(locateBtn.exists()).toBe(true)
    expect(locateBtn.classes()).toContain('active')
    expect(locateBtn.classes()).toContain('is-live-locating')
    expect(locateBtn.find('.pulse-slow').exists()).toBe(true)
    expect(locateBtn.attributes('title')).toContain('Hvor er jeg (på')
  })

  it('viser inaktiv tilstand uten puls-effekt på Hvor er jeg-knappen når isLiveLocating er false', () => {
    const wrapper = mount(HeaderActionsDropdown, {
      props: {
        isOpen: true,
        isLiveLocating: false,
        isLocating: false,
      },
    })

    const locateBtn = wrapper.find('.btn-locate')
    expect(locateBtn.exists()).toBe(true)
    expect(locateBtn.classes()).not.toContain('active')
    expect(locateBtn.classes()).not.toContain('is-live-locating')
    expect(locateBtn.find('.pulse-slow').exists()).toBe(false)
    expect(locateBtn.attributes('title')).toBe('Hvor er jeg?')
  })

  it('tilbakestiller heading på coords når stopLiveLocating kalles uten aktiv sporing', () => {
    const { startLiveLocating, stopLiveLocating, coords } = useGeolocation()
    startLiveLocating()
    if (watchSuccessCallback) {
      watchSuccessCallback({
        coords: {
          latitude: 60.39,
          longitude: 5.32,
          accuracy: 5,
          heading: 120,
          speed: 1,
          altitude: 10,
        },
        timestamp: Date.now(),
      } as GeolocationPosition)
    }
    expect(coords.value?.heading).toBe(120)

    stopLiveLocating()
    expect(coords.value?.heading).toBeNull()
  })
})
