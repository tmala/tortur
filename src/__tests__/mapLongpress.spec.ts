import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import L from 'leaflet'
import {
  useMapLongpress,
  LONGPRESS_DURATION_MS,
  MOVE_THRESHOLD_PX,
  triggerHapticFeedback,
  type LongpressCoords,
  type LongpressPoint
} from '../composables/map/useMapLongpress'
import MapContextMenu from '../components/MapContextMenu.vue'
import AddTurpostModal from '../components/AddTurpostModal.vue'
import MapViewer from '../components/MapViewer.vue'
import MapView from '../views/MapView.vue'
import { useAuth } from '../composables/useAuth'
import { useAppStateStore } from '../stores/appState'
import type { TurpostItem } from '../composables/useTurposter'

describe('useMapLongpress', () => {
  let mockContainer: HTMLElement
  let mockMap: L.Map

  beforeEach(() => {
    vi.useFakeTimers()
    vi.restoreAllMocks()

    mockContainer = document.createElement('div')
    vi.spyOn(mockContainer, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 50,
      width: 500,
      height: 400,
      right: 600,
      bottom: 450,
      x: 100,
      y: 50,
      toJSON: () => {}
    } as unknown as DOMRect)

    mockMap = {
      containerPointToLatLng: vi.fn().mockReturnValue(L.latLng(60.39, 5.32)),
      on: vi.fn(),
      off: vi.fn()
    } as unknown as L.Map
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('exports LONGPRESS_DURATION_MS as 1500 ms', () => {
    expect(LONGPRESS_DURATION_MS).toBe(1500)
  })

  it('exports MOVE_THRESHOLD_PX as 25 px', () => {
    expect(MOVE_THRESHOLD_PX).toBe(25)
  })

  it('triggers haptic feedback when navigator.vibrate is supported', () => {
    const vibrateSpy = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { vibrate: vibrateSpy })

    const result = triggerHapticFeedback(50)
    expect(result).toBe(true)
    expect(vibrateSpy).toHaveBeenCalledWith(50)

    vi.unstubAllGlobals()
  })

  it('handles platforms without vibrate silently', () => {
    vi.stubGlobal('navigator', {})
    const result = triggerHapticFeedback(50)
    expect(result).toBe(false)
    vi.unstubAllGlobals()
  })

  it('does not trigger longpress if user is not logged in', () => {
    const onRelease = vi.fn()
    const longpress = useMapLongpress({
      getMap: () => mockMap,
      getContainer: () => mockContainer,
      isLoggedIn: () => false,
      onLongpressRelease: onRelease
    })
    longpress.attachEvents()

    const pointerDownEvent = new PointerEvent('pointerdown', {
      clientX: 200,
      clientY: 150,
      pointerId: 1,
      pointerType: 'touch'
    })
    mockContainer.dispatchEvent(pointerDownEvent)

    expect(longpress.isPressing.value).toBe(false)
    vi.advanceTimersByTime(3100)
    expect(longpress.isReady.value).toBe(false)
    expect(onRelease).not.toHaveBeenCalled()
    longpress.cleanup()
  })

  it('activates longpress when holding for configured duration and triggers on release', () => {
    let releasedCoords: LongpressCoords | null = null
    let releasedPoint: LongpressPoint | null = null
    const vibrateSpy = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { vibrate: vibrateSpy })

    const longpress = useMapLongpress({
      getMap: () => mockMap,
      getContainer: () => mockContainer,
      isLoggedIn: () => true,
      onLongpressRelease: (coords, point) => {
        releasedCoords = coords
        releasedPoint = point
      },
      durationMs: 3000
    })
    longpress.attachEvents()

    const pointerDownEvent = new PointerEvent('pointerdown', {
      clientX: 200,
      clientY: 150,
      pointerId: 1,
      pointerType: 'touch'
    })
    mockContainer.dispatchEvent(pointerDownEvent)

    expect(longpress.isPressing.value).toBe(true)
    expect(longpress.isReady.value).toBe(false)
    expect(longpress.pressPoint.value).toEqual({ x: 100, y: 100 }) // 200-100, 150-50

    // Advance 2900 ms - still not ready
    vi.advanceTimersByTime(2900)
    expect(longpress.isReady.value).toBe(false)
    expect(vibrateSpy).not.toHaveBeenCalled()

    // Advance remaining 100 ms (total 3000 ms)
    vi.advanceTimersByTime(100)
    expect(longpress.isReady.value).toBe(true)
    expect(vibrateSpy).toHaveBeenCalledWith(50)

    // Release pointer
    const pointerUpEvent = new PointerEvent('pointerup', {
      clientX: 200,
      clientY: 150,
      pointerId: 1,
      pointerType: 'touch'
    })
    window.dispatchEvent(pointerUpEvent)

    expect(releasedCoords).toEqual({ lat: 60.39, lng: 5.32 })
    expect(releasedPoint).toEqual({ x: 100, y: 100 })
    expect(longpress.isPressing.value).toBe(false)

    longpress.cleanup()
    vi.unstubAllGlobals()
  })

  it('does not cancel longpress if movement is within threshold', () => {
    const onRelease = vi.fn()
    const longpress = useMapLongpress({
      getMap: () => mockMap,
      getContainer: () => mockContainer,
      isLoggedIn: () => true,
      onLongpressRelease: onRelease,
      durationMs: 1500
    })
    longpress.attachEvents()

    mockContainer.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 200,
        clientY: 150,
        pointerId: 1,
        pointerType: 'touch'
      })
    )
    expect(longpress.isPressing.value).toBe(true)

    // Move pointer within threshold (15px delta <= 25px)
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 215, // 15px delta
        clientY: 150,
        pointerId: 1,
        pointerType: 'touch'
      })
    )

    // Should still be pressing
    expect(longpress.isPressing.value).toBe(true)

    // Advance remaining time - should trigger ready
    vi.advanceTimersByTime(1500)
    expect(longpress.isReady.value).toBe(true)

    longpress.cleanup()
  })

  it('cancels longpress if movement exceeds threshold before time is up', () => {
    const onRelease = vi.fn()
    const longpress = useMapLongpress({
      getMap: () => mockMap,
      getContainer: () => mockContainer,
      isLoggedIn: () => true,
      onLongpressRelease: onRelease,
      durationMs: 1500
    })
    longpress.attachEvents()

    mockContainer.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 200,
        clientY: 150,
        pointerId: 1,
        pointerType: 'touch'
      })
    )
    expect(longpress.isPressing.value).toBe(true)

    // Move pointer more than threshold (35px delta > 25px)
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 235, // 35px delta
        clientY: 150,
        pointerId: 1,
        pointerType: 'touch'
      })
    )

    expect(longpress.isPressing.value).toBe(false)

    // Advance timers - should not trigger
    vi.advanceTimersByTime(2000)
    expect(longpress.isReady.value).toBe(false)

    window.dispatchEvent(
      new PointerEvent('pointerup', {
        clientX: 235,
        clientY: 150,
        pointerId: 1,
        pointerType: 'touch'
      })
    )
    expect(onRelease).not.toHaveBeenCalled()

    longpress.cleanup()
  })

  it('cancels longpress if user releases before duration is reached', () => {
    const onRelease = vi.fn()
    const longpress = useMapLongpress({
      getMap: () => mockMap,
      getContainer: () => mockContainer,
      isLoggedIn: () => true,
      onLongpressRelease: onRelease,
      durationMs: 3000
    })
    longpress.attachEvents()

    mockContainer.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 200,
        clientY: 150,
        pointerId: 1,
        pointerType: 'touch'
      })
    )

    // Release after 1 second
    vi.advanceTimersByTime(1000)
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        clientX: 200,
        clientY: 150,
        pointerId: 1,
        pointerType: 'touch'
      })
    )

    expect(longpress.isPressing.value).toBe(false)
    expect(longpress.isReady.value).toBe(false)
    expect(onRelease).not.toHaveBeenCalled()

    longpress.cleanup()
  })
})

describe('MapContextMenu', () => {
  it('does not render when isOpen is false', () => {
    const wrapper = mount(MapContextMenu, {
      props: {
        isOpen: false,
        coords: { lat: 60.39, lng: 5.32 },
        point: { x: 100, y: 150 }
      }
    })

    expect(wrapper.find('.context-menu-card').exists()).toBe(false)
  })

  it('renders correctly and emits events for both actions', async () => {
    const wrapper = mount(MapContextMenu, {
      props: {
        isOpen: true,
        coords: { lat: 60.39123, lng: 5.32456 },
        point: { x: 150, y: 200 }
      }
    })

    expect(wrapper.find('.context-menu-card').exists()).toBe(true)
    expect(wrapper.text()).toContain('60.39123, 5.32456')
    expect(wrapper.text()).toContain('Opprett Turpost')
    expect(wrapper.text()).toContain('Vis turposter her')

    // Click "Opprett Turpost"
    await wrapper.find('.btn-primary').trigger('click')
    expect(wrapper.emitted('create-turpost')).toBeTruthy()
    expect(wrapper.emitted('create-turpost')?.[0]).toEqual([{ lat: 60.39123, lng: 5.32456 }])

    // Click "Vis turposter her"
    await wrapper.find('.btn-secondary').trigger('click')
    expect(wrapper.emitted('show-turposter-here')).toBeTruthy()
    expect(wrapper.emitted('show-turposter-here')?.[0]).toEqual([{ lat: 60.39123, lng: 5.32456 }])

    // Click close button
    await wrapper.find('.btn-close').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('closes on Escape key', async () => {
    const wrapper = mount(MapContextMenu, {
      props: {
        isOpen: true,
        coords: { lat: 60.39, lng: 5.32 },
        point: { x: 100, y: 100 }
      }
    })

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})

describe('MapView Longpress Context Menu Integration', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.restoreAllMocks()

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('kommuner.geojson')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { name: 'Kvam' },
                geometry: {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [6.0, 60.1],
                      [6.3, 60.1],
                      [6.3, 60.4],
                      [6.0, 60.4],
                      [6.0, 60.1]
                    ]
                  ]
                }
              }
            ]
          })
        } as unknown as Response
      }
      if (urlStr.includes('hierarchy.json')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => [
            {
              name: 'Vestland',
              slug: 'vestland',
              count: 10,
              kommuner: [{ name: 'Kvam', slug: 'kvam', count: 5 }, { name: 'Bergen', slug: 'bergen', count: 5 }]
            }
          ]
        } as unknown as Response
      }
      if (urlStr.includes('bergen.json')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => [
            { id: 1, name: 'Ulriken', lat: 60.378, lng: 5.385, alt: 643 }
          ]
        } as unknown as Response
      }
      return { ok: false, headers: { get: () => '' } } as unknown as Response
    })
  })

  it('opens AddTurpostModal directly without isAddSpotModeActive when create-turpost is triggered', async () => {
    const { user } = useAuth()
    user.value = {
      userId: 'test-user-1',
      userName: 'Ola Nordmann',
      email: 'ola@example.com',
      avatarUrl: '',
      lastLogin: new Date().toISOString()
    }

    const appState = useAppStateStore()
    expect(appState.isAddSpotModeActive).toBe(false)

    const wrapper = mount(MapView, {
      global: {
        plugins: [pinia],
        stubs: {
          MapViewer: {
            name: 'MapViewer',
            template: '<div class="map-viewer-stub"><slot /></div>',
            methods: {
              suppressNextFitBounds: vi.fn(),
              panToCoordinate: vi.fn(),
              centerOnUser: vi.fn()
            }
          },
          AppHeader: true,
          RouterView: true,
          TrackPlaybackPanel: true,
          LocationControls: true,
          TurposterPanel: true,
          CheckinModal: true,
          TurpostCheckinsModal: true,
          UserProfileMenu: true,
          AddTurpostModal: {
            name: 'AddTurpostModal',
            props: ['isOpen', 'lat', 'lng', 'isAdmin', 'userId', 'userName', 'userEmail'],
            template: '<div v-if="isOpen" class="add-turpost-modal-stub">Modal (lat: {{ lat }}, lng: {{ lng }})</div>'
          }
        }
      }
    })

    await flushPromises()
    await wrapper.vm.$nextTick()

    const mapViewer = wrapper.findComponent({ name: 'MapViewer' })
    expect(mapViewer.exists()).toBe(true)

    // Simulate longpress release on map
    mapViewer.vm.$emit('map-longpress', { lat: 60.392, lng: 5.328 }, { x: 200, y: 300 })
    await wrapper.vm.$nextTick()

    const contextMenu = wrapper.findComponent(MapContextMenu)
    expect(contextMenu.exists()).toBe(true)
    expect(contextMenu.props('isOpen')).toBe(true)
    expect(contextMenu.props('coords')).toEqual({ lat: 60.392, lng: 5.328 })

    // Trigger "create-turpost" from the context menu
    contextMenu.vm.$emit('create-turpost', { lat: 60.392, lng: 5.328 })
    await wrapper.vm.$nextTick()

    // 1. isAddSpotModeActive must remain FALSE (no top banner)
    expect(appState.isAddSpotModeActive).toBe(false)
    expect(wrapper.find('.add-spot-banner').exists()).toBe(false)

    // 2. AddTurpostModal must be opened directly with the longpress coordinates
    const addModals = wrapper.findAllComponents({ name: 'AddTurpostModal' })
    const activeModal = addModals.find((m) => m.props('isOpen') === true)
    expect(activeModal).toBeDefined()
    expect(activeModal?.props('lat')).toBe(60.392)
    expect(activeModal?.props('lng')).toBe(5.328)
    expect(activeModal?.props('userId')).toBe('test-user-1')

    // 3. Saving spot should update mySpots and close the direct modal
    activeModal?.vm.$emit('spot-saved', {
      id: '999',
      name: 'Ny Turpost',
      lat: 60.392,
      lng: 5.328,
      alt: null,
      isPrivate: true
    })
    await wrapper.vm.$nextTick()

    expect(appState.mySpots.some((s) => s.id === '999')).toBe(true)
    const activeModalAfterSave = wrapper.findAllComponents({ name: 'AddTurpostModal' }).find((m) => m.props('isOpen') === true)
    expect(activeModalAfterSave).toBeUndefined()
  })

  it('calls suppressNextFitBounds and does not pan/zoom when show-turposter-here is triggered', async () => {
    const { user } = useAuth()
    user.value = {
      userId: 'test-user-1',
      userName: 'Ola Nordmann',
      email: 'ola@example.com',
      avatarUrl: '',
      lastLogin: new Date().toISOString()
    }

    const suppressNextFitBoundsMock = vi.fn()
    const panToCoordinateMock = vi.fn()

    const wrapper = mount(MapView, {
      global: {
        plugins: [pinia],
        stubs: {
          MapViewer: {
            name: 'MapViewer',
            template: '<div class="map-viewer-stub"><slot /></div>',
            props: ['suppressFitBounds'],
            methods: {
              suppressNextFitBounds: suppressNextFitBoundsMock,
              panToCoordinate: panToCoordinateMock,
              centerOnUser: vi.fn()
            }
          },
          AppHeader: true,
          RouterView: true,
          TrackPlaybackPanel: true,
          LocationControls: true,
          TurposterPanel: true,
          CheckinModal: true,
          TurpostCheckinsModal: true,
          UserProfileMenu: true,
          AddTurpostModal: true
        }
      }
    })

    const mapViewer = wrapper.findComponent({ name: 'MapViewer' })
    mapViewer.vm.$emit('map-longpress', { lat: 60.392, lng: 5.328 }, { x: 200, y: 300 })
    await wrapper.vm.$nextTick()

    const contextMenu = wrapper.findComponent(MapContextMenu)
    contextMenu.vm.$emit('show-turposter-here', { lat: 60.392, lng: 5.328 })
    await wrapper.vm.$nextTick()

    // Verification: panToCoordinate must NOT be called (centerMode: 'none')
    expect(panToCoordinateMock).not.toHaveBeenCalled()
    // suppressNextFitBounds MUST be called to prevent zooming out to the whole municipality
    expect(suppressNextFitBoundsMock).toHaveBeenCalled()
    expect(mapViewer.props('suppressFitBounds')).toBe(true)

    await flushPromises()
    expect(mapViewer.props('suppressFitBounds')).toBe(false)
  })
})

describe('AddTurpostModal Direct Form Rendering', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('renders all form fields on mount when opened with coordinates', async () => {
    mount(AddTurpostModal, {
      props: {
        isOpen: true,
        lat: 60.29411,
        lng: 6.159547,
        isAdmin: false,
        userId: 'test-user-1',
        userName: 'Ola Nordmann',
        userEmail: 'ola@example.com'
      }
    })

    // Inputs must be rendered immediately
    const nameInput = document.body.querySelector('#turpost-name') as HTMLInputElement | null
    const altInput = document.body.querySelector('#turpost-alt') as HTMLInputElement | null
    const checkbox = document.body.querySelector('.custom-checkbox')
    expect(nameInput).not.toBeNull()
    expect(altInput).not.toBeNull()
    expect(checkbox).not.toBeNull()
    expect(document.body.textContent).toContain('Foreslå som offentlig turpost for godkjenning hos admin')

    // Wait for geo-detection to complete
    await flushPromises()

    // Fylke and kommune must be detected and displayed
    expect(document.body.textContent).toContain('Vestland')
    expect(document.body.textContent).toContain('Kvam')

    // Save button must be disabled initially (name and alt are empty)
    const saveBtn = document.body.querySelector('.btn-save-spot') as HTMLButtonElement | null
    expect(saveBtn).not.toBeNull()
    expect(saveBtn?.disabled).toBe(true)

    // Fill in name and altitude
    if (nameInput) {
      nameInput.value = 'Kvamstoppen'
      nameInput.dispatchEvent(new Event('input'))
    }
    if (altInput) {
      altInput.value = '520'
      altInput.dispatchEvent(new Event('input'))
    }

    await flushPromises()

    // Now save button must be enabled
    expect(saveBtn?.disabled).toBe(false)
  })

  it('automatically fills in altitude from Geonorge when creating turpost in Norway', async () => {
    document.body.innerHTML = ''
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('kommuner.geojson')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { name: 'Kvam' },
                geometry: {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [6.0, 60.1],
                      [6.3, 60.1],
                      [6.3, 60.4],
                      [6.0, 60.4],
                      [6.0, 60.1]
                    ]
                  ]
                }
              }
            ]
          })
        } as unknown as Response
      }
      if (urlStr.includes('hierarchy.json')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => [
            {
              name: 'Vestland',
              slug: 'vestland',
              count: 10,
              kommuner: [{ name: 'Kvam', slug: 'kvam', count: 5 }]
            }
          ]
        } as unknown as Response
      }
      if (urlStr.includes('ws.geonorge.no/hoydedata/v1/punkt')) {
        return {
          ok: true,
          json: async () => ({
            punkter: [
              {
                ost: 280000,
                nord: 6680000,
                koordsys: 4258,
                z: 580.4,
                terreng: 580.4,
                datakilde: 'NDH'
              }
            ]
          })
        } as unknown as Response
      }
      return { ok: false, headers: { get: () => '' } } as unknown as Response
    })

    mount(AddTurpostModal, {
      props: {
        isOpen: true,
        lat: 60.29411,
        lng: 6.159547,
        isAdmin: false,
        userId: 'test-user-1',
        userName: 'Ola Nordmann',
        userEmail: 'ola@example.com'
      }
    })

    await flushPromises()

    const altInput = document.body.querySelector('#turpost-alt') as HTMLInputElement | null
    expect(altInput).not.toBeNull()
    expect(altInput?.value).toBe('580')
    expect(document.body.textContent).toContain('Hentet fra koter/høydedata')

    // Verify Geonorge API was indeed called
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('ws.geonorge.no/hoydedata/v1/punkt'),
      expect.any(Object)
    )
  })

  it('does not call Geonorge elevation API when creating turpost outside Norway', async () => {
    document.body.innerHTML = ''
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url)
      if (urlStr.includes('kommuner.geojson')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({
            type: 'FeatureCollection',
            features: []
          })
        } as unknown as Response
      }
      if (urlStr.includes('hierarchy.json')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => []
        } as unknown as Response
      }
      return { ok: false, headers: { get: () => '' } } as unknown as Response
    })

    mount(AddTurpostModal, {
      props: {
        isOpen: true,
        lat: 38.0904, // Guardamar, Spania
        lng: -0.6577,
        isAdmin: false,
        userId: 'test-user-1',
        userName: 'Ola Nordmann',
        userEmail: 'ola@example.com'
      }
    })

    await flushPromises()

    const altInput = document.body.querySelector('#turpost-alt') as HTMLInputElement | null
    expect(altInput).not.toBeNull()
    expect(altInput?.value).toBe('')
    expect(document.body.textContent).not.toContain('Hentet fra koter/høydedata')

    // Verify Geonorge API was NOT called for abroad coordinates
    const geonorgeCalls = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).includes('ws.geonorge.no')
    )
    expect(geonorgeCalls.length).toBe(0)
  })
})

describe('MapViewer fitBounds suppression', () => {
  let fitBoundsMock: ReturnType<typeof vi.fn>
  let mockMapInstance: Record<string, unknown>

  beforeEach(() => {
    vi.restoreAllMocks()
    fitBoundsMock = vi.fn()
    mockMapInstance = {
      fitBounds: fitBoundsMock,
      flyTo: vi.fn(),
      panTo: vi.fn(),
      setView: vi.fn(),
      getZoom: vi.fn().mockReturnValue(13),
      getCenter: vi.fn().mockReturnValue({ lat: 60.39, lng: 5.32 }),
      getBounds: vi.fn().mockReturnValue({
        getNorth: () => 61,
        getSouth: () => 60,
        getEast: () => 6,
        getWest: () => 5
      }),
      on: vi.fn(),
      off: vi.fn(),
      removeLayer: vi.fn(),
      addLayer: vi.fn(),
      closePopup: vi.fn(),
      remove: vi.fn(),
      invalidateSize: vi.fn(),
      latLngToContainerPoint: vi.fn().mockReturnValue({ x: 0, y: 0 })
    }

    vi.spyOn(L, 'map').mockReturnValue(mockMapInstance as unknown as L.Map)
    vi.spyOn(L, 'layerGroup').mockReturnValue({
      addTo: vi.fn().mockReturnThis(),
      clearLayers: vi.fn(),
      addLayer: vi.fn(),
      removeLayer: vi.fn()
    } as unknown as L.LayerGroup)
    vi.spyOn(L, 'tileLayer').mockReturnValue({
      addTo: vi.fn().mockReturnThis()
    } as unknown as L.TileLayer)
    vi.spyOn(L, 'marker').mockReturnValue({
      addTo: vi.fn().mockReturnThis(),
      bindPopup: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      setPopupContent: vi.fn().mockReturnThis()
    } as unknown as L.Marker)
  })

  it('does NOT call fitBounds when suppressFitBounds is true', async () => {
    const wrapper = mount(MapViewer, {
      props: {
        userLocation: null,
        activeLayer: 'norgeskart',
        isTracking: false,
        turposter: [],
        selectedKommuneName: 'Bergen',
        suppressFitBounds: true
      }
    })

    wrapper.vm.resetAutoCenter()

    const samplePosts: TurpostItem[] = [
      { id: '1', name: 'Fløyen', lat: 60.39, lng: 5.33, alt: 400, fylke: 'Vestland', kommune: 'Bergen' }
    ]
    await wrapper.setProps({ turposter: samplePosts })
    await wrapper.vm.$nextTick()

    expect(fitBoundsMock).not.toHaveBeenCalled()
  })

  it('calls fitBounds when suppressFitBounds is false and auto-center is disabled', async () => {
    const wrapper = mount(MapViewer, {
      props: {
        userLocation: null,
        activeLayer: 'norgeskart',
        isTracking: false,
        turposter: [],
        selectedKommuneName: 'Bergen',
        suppressFitBounds: false
      }
    })

    wrapper.vm.resetAutoCenter()

    const samplePosts: TurpostItem[] = [
      { id: '1', name: 'Fløyen', lat: 60.39, lng: 5.33, alt: 400, fylke: 'Vestland', kommune: 'Bergen' }
    ]
    await wrapper.setProps({ turposter: samplePosts })
    await wrapper.vm.$nextTick()

    expect(fitBoundsMock).toHaveBeenCalled()
  })

  it('does NOT call fitBounds when suppressNextFitBounds() is invoked', async () => {
    const wrapper = mount(MapViewer, {
      props: {
        userLocation: null,
        activeLayer: 'norgeskart',
        isTracking: false,
        turposter: [],
        selectedKommuneName: 'Bergen',
        suppressFitBounds: false
      }
    })

    wrapper.vm.resetAutoCenter()
    wrapper.vm.suppressNextFitBounds()

    const samplePosts: TurpostItem[] = [
      { id: '1', name: 'Fløyen', lat: 60.39, lng: 5.33, alt: 400, fylke: 'Vestland', kommune: 'Bergen' }
    ]
    await wrapper.setProps({ turposter: samplePosts })
    await wrapper.vm.$nextTick()

    expect(fitBoundsMock).not.toHaveBeenCalled()
  })
})

