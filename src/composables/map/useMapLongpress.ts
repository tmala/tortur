import { ref, onUnmounted, getCurrentInstance } from 'vue'
import L from 'leaflet'

/**
 * Konfigurerbar varighet for kart-longpress i millisekunder.
 * Juster denne verdien etter behov (standard: 1500 ms = 1,5 sekunder).
 */
export const LONGPRESS_DURATION_MS = 1500

/**
 * Maksimal bevegelse i piksler før et påbegynt trykk regnes som en bevisst panorering og avbrytes.
 * Satt til 25px for å tåle naturlig fingerbevegelse og skjelving på berøringsskjermer uten å avbryte longpress.
 */
export const MOVE_THRESHOLD_PX = 25

export interface LongpressCoords {
  lat: number
  lng: number
}

export interface LongpressPoint {
  x: number
  y: number
}

export interface UseMapLongpressOptions {
  getMap: () => L.Map | null
  getContainer: () => HTMLElement | null
  isLoggedIn: () => boolean
  onLongpressReady?: (coords: LongpressCoords, point: LongpressPoint) => void
  onLongpressRelease: (coords: LongpressCoords, point: LongpressPoint) => void
  durationMs?: number
  moveThresholdPx?: number
}

/**
 * Utfører haptisk tilbakemelding (vibrasjon) der det støttes av enheten/nettleseren.
 * Fungerer på Android (Chrome og PWA). På iOS og plattformer uten støtte feiler kallet stille.
 */
export function triggerHapticFeedback(pattern: number | number[] = 50): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      return navigator.vibrate(pattern)
    } catch {
      return false
    }
  }
  return false
}

export function useMapLongpress(options: UseMapLongpressOptions) {
  const duration = options.durationMs ?? LONGPRESS_DURATION_MS
  const moveThreshold = options.moveThresholdPx ?? MOVE_THRESHOLD_PX

  const isPressing = ref(false)
  const isReady = ref(false)
  const pressPoint = ref<LongpressPoint | null>(null)

  let timerId: ReturnType<typeof setTimeout> | null = null
  let activePointerId: number | null = null
  let startScreenPos: { x: number; y: number } | null = null
  let activeCoords: LongpressCoords | null = null
  let activePoint: LongpressPoint | null = null
  let isSuppressingClick = false
  let clickSuppressTimer: ReturnType<typeof setTimeout> | null = null

  const clearTimer = () => {
    if (timerId !== null) {
      clearTimeout(timerId)
      timerId = null
    }
  }

  const removeWindowListeners = () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
    }
  }

  const cancelPress = () => {
    clearTimer()
    removeWindowListeners()
    isPressing.value = false
    isReady.value = false
    pressPoint.value = null
    activePointerId = null
    startScreenPos = null
    activeCoords = null
    activePoint = null
  }

  const suppressClickTemporarily = () => {
    isSuppressingClick = true
    if (clickSuppressTimer !== null) {
      clearTimeout(clickSuppressTimer)
    }
    clickSuppressTimer = setTimeout(() => {
      isSuppressingClick = false
      clickSuppressTimer = null
    }, 350)
  }

  const handlePointerDown = (e: PointerEvent) => {
    // 1. Longpress skal kun aktiveres for innloggede brukere
    if (!options.isLoggedIn()) return

    // 2. Mus: Krev venstre museknapp (button === 0)
    if (e.pointerType === 'mouse' && e.button !== 0) return

    // 3. Ikke start longpress hvis brukeren trykker på kontroller, eksisterende markører eller knapper
    const target = e.target as HTMLElement | null
    if (
      target?.closest(
        '.leaflet-control, .leaflet-popup, .leaflet-marker-icon, .custom-user-pin, .context-menu, button, a, input',
      )
    ) {
      return
    }

    const map = options.getMap()
    const container = options.getContainer()
    if (!map || !container) return

    const rect = container.getBoundingClientRect()
    const pointX = e.clientX - rect.left
    const pointY = e.clientY - rect.top

    // Beregn kartkoordinater fra trykkpunktet
    const leafletPoint = L.point(pointX, pointY)
    const latlng = map.containerPointToLatLng(leafletPoint)

    cancelPress()

    activePointerId = e.pointerId
    startScreenPos = { x: e.clientX, y: e.clientY }
    activeCoords = { lat: latlng.lat, lng: latlng.lng }
    activePoint = { x: pointX, y: pointY }

    isPressing.value = true
    isReady.value = false
    pressPoint.value = { x: pointX, y: pointY }

    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', handlePointerMove, { passive: true })
      window.addEventListener('pointerup', handlePointerUp, { passive: true })
      window.addEventListener('pointercancel', handlePointerCancel, { passive: true })
    }

    timerId = setTimeout(() => {
      if (!isPressing.value || !activeCoords || !activePoint) return

      isReady.value = true

      // Gi haptisk tilbakemelding (vibrasjon) når longpress-varigheten er fullført
      triggerHapticFeedback(50)

      if (options.onLongpressReady) {
        options.onLongpressReady(activeCoords, activePoint)
      }
    }, duration)
  }

  const handlePointerMove = (e: PointerEvent) => {
    if (!isPressing.value || e.pointerId !== activePointerId || !startScreenPos) return

    const distance = Math.hypot(e.clientX - startScreenPos.x, e.clientY - startScreenPos.y)
    if (distance > moveThreshold) {
      // Brukeren drar kartet / beveger fingeren for mye – avbryt longpress
      cancelPress()
    }
  }

  const handlePointerUp = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return

    const wasReady = isReady.value
    const coords = activeCoords ? { ...activeCoords } : null
    const point = activePoint ? { ...activePoint } : null

    cancelPress()

    if (wasReady && coords && point) {
      // Brukeren har holdt nede i 3 sekunder og slipper opp: Vis menyen!
      suppressClickTemporarily()
      options.onLongpressRelease(coords, point)
    }
  }

  const handlePointerCancel = (e: PointerEvent) => {
    if (e.pointerId === activePointerId) {
      cancelPress()
    }
  }

  const handleContextMenu = (e: MouseEvent) => {
    // Forhindre standard kontekstmeny (f.eks. på Android etter 500ms eller høyreklikk)
    // slik at den ikke forstyrrer eller avbryter longpress på kartet
    if (options.isLoggedIn()) {
      e.preventDefault()
    }
  }

  const handleClickCapture = (e: MouseEvent) => {
    if (isSuppressingClick) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  let attachedContainer: HTMLElement | null = null
  let attachedMap: L.Map | null = null

  const attachEvents = () => {
    const container = options.getContainer()
    const map = options.getMap()

    if (container && container !== attachedContainer) {
      detachContainerEvents()
      attachedContainer = container
      container.addEventListener('pointerdown', handlePointerDown)
      container.addEventListener('contextmenu', handleContextMenu)
      container.addEventListener('click', handleClickCapture, true)
    }

    if (map && map !== attachedMap) {
      detachMapEvents()
      attachedMap = map
      map.on('zoomstart', cancelPress)
    }
  }

  const detachContainerEvents = () => {
    if (attachedContainer) {
      attachedContainer.removeEventListener('pointerdown', handlePointerDown)
      attachedContainer.removeEventListener('contextmenu', handleContextMenu)
      attachedContainer.removeEventListener('click', handleClickCapture, true)
      attachedContainer = null
    }
  }

  const detachMapEvents = () => {
    if (attachedMap) {
      attachedMap.off('zoomstart', cancelPress)
      attachedMap = null
    }
  }

  const cleanup = () => {
    cancelPress()
    detachContainerEvents()
    detachMapEvents()
    if (clickSuppressTimer !== null) {
      clearTimeout(clickSuppressTimer)
      clickSuppressTimer = null
    }
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      cleanup()
    })
  }

  return {
    isPressing,
    isReady,
    pressPoint,
    cancelPress,
    attachEvents,
    cleanup,
  }
}
