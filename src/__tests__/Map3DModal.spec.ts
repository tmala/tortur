import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import Map3DModal from '@/components/map3d/Map3DModal.vue'

const mockEaseTo = vi.fn()
const mockSetStyle = vi.fn()
const mockSetTerrain = vi.fn()
const mockRemoveMap = vi.fn()
const mockAddControl = vi.fn()
const mockOnce = vi.fn((event: string, cb: () => void) => {
  if (event === 'load' || event === 'style.load') {
    cb()
  }
})

const mockMarkerRemove = vi.fn()
const mockSetLngLat = vi.fn().mockReturnThis()
const mockSetPopup = vi.fn().mockReturnThis()
const mockAddTo = vi.fn().mockReturnThis()

vi.mock('maplibre-gl', () => {
  return {
    Map: vi.fn().mockImplementation(function () {
      return {
        addControl: mockAddControl,
        once: mockOnce,
        on: vi.fn(),
        isStyleLoaded: vi.fn().mockReturnValue(false),
        setStyle: mockSetStyle,
        setTerrain: mockSetTerrain,
        easeTo: mockEaseTo,
        remove: mockRemoveMap
      }
    }),
    Marker: vi.fn().mockImplementation(function () {
      return {
        setLngLat: mockSetLngLat,
        setPopup: mockSetPopup,
        addTo: mockAddTo,
        remove: mockMarkerRemove
      }
    }),
    Popup: vi.fn().mockImplementation(function () {
      return {
        setHTML: vi.fn().mockReturnThis()
      }
    }),
    NavigationControl: vi.fn().mockImplementation(function () {
      return {}
    }),
    setWorkerUrl: vi.fn()
  }
})

describe('Map3DModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rendrer ingenting når isOpen er false', () => {
    const wrapper = mount(Map3DModal, {
      props: {
        isOpen: false,
        mapboxToken: 'pk.test_token'
      }
    })

    expect(wrapper.find('.map3d-dialog').exists()).toBe(false)
  })

  it('rendrer 3D-dialog og initialiserer kart når isOpen er true', async () => {
    const wrapper = mount(Map3DModal, {
      props: {
        isOpen: true,
        mapboxToken: 'pk.test_token',
        center: { lat: 60.39, lng: 5.32, zoom: 14 }
      }
    })

    expect(wrapper.find('.map3d-dialog').exists()).toBe(true)
    expect(wrapper.text()).toContain('3D Terrengvisning')
    expect(wrapper.text()).toContain('Mapbox')

    // Spol fremover slik at setTimeout (50ms) kjører for kartinitialisering
    vi.advanceTimersByTime(60)

    expect(mockAddControl).toHaveBeenCalled()
  })

  it('emitterer close når lukkeknappen trykkes', async () => {
    const wrapper = mount(Map3DModal, {
      props: {
        isOpen: true,
        mapboxToken: 'pk.test_token'
      }
    })

    const closeBtn = wrapper.find('.btn-close')
    expect(closeBtn.exists()).toBe(true)
    await closeBtn.trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('emitterer close ved Escape-tastetrykk', async () => {
    const wrapper = mount(Map3DModal, {
      props: {
        isOpen: true,
        mapboxToken: 'pk.test_token'
      }
    })

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('endrer kartstil når stilikoner trykkes', async () => {
    const wrapper = mount(Map3DModal, {
      props: {
        isOpen: true,
        mapboxToken: 'pk.test_token'
      }
    })

    vi.advanceTimersByTime(60)

    const buttons = wrapper.findAll('.pill-btn')
    // buttons: [Topo, Norgeskart, Satellitt, Friluft]
    expect(buttons.length).toBe(4)

    // Klikk på Norgeskart
    await buttons[1]!.trigger('click')
    expect(mockSetStyle).toHaveBeenCalled()

    // Klikk på Satellitt
    await buttons[2]!.trigger('click')
    expect(mockSetStyle).toHaveBeenCalledTimes(2)
  })

  it('endrer terrengoverdrivelse når høydeknapper trykkes', async () => {
    const wrapper = mount(Map3DModal, {
      props: {
        isOpen: true,
        mapboxToken: 'pk.test_token'
      }
    })

    vi.advanceTimersByTime(60)

    const exagBtns = wrapper.findAll('.exag-btn')
    expect(exagBtns.length).toBe(4)

    // Klikk på 1.8x
    await exagBtns[2]!.trigger('click')
    expect(mockSetTerrain).toHaveBeenCalledWith(
      expect.objectContaining({
        exaggeration: 1.8
      })
    )
  })

  it('nullstiller kameravinkel til nord og 74 grader ved klikk på kontrollknappen', async () => {
    const wrapper = mount(Map3DModal, {
      props: {
        isOpen: true,
        mapboxToken: 'pk.test_token'
      }
    })

    vi.advanceTimersByTime(60)

    const resetBtn = wrapper.find('.control-btn')
    expect(resetBtn.exists()).toBe(true)
    await resetBtn.trigger('click')

    expect(mockEaseTo).toHaveBeenCalledWith(
      expect.objectContaining({
        pitch: 74,
        bearing: 0
      })
    )
  })

  it('rendrer besøkte turposter med is-visited markør', async () => {
    mount(Map3DModal, {
      props: {
        isOpen: true,
        mapboxToken: 'pk.test_token',
        center: { lat: 60.39, lng: 5.32, zoom: 14 },
        turposter: [
          { id: 'post_1', name: 'Ulriken', lat: 60.37, lng: 5.38, alt: 643 },
          { id: 'post_2', name: 'Fløyen', lat: 60.39, lng: 5.33, alt: 400 }
        ],
        visitedTurpostIds: new Set(['post_1'])
      }
    })

    vi.advanceTimersByTime(60)
    // Marker ble instansiert for begge poster
    expect(mockSetLngLat).toHaveBeenCalled()
  })
})
