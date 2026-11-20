import { ref, computed } from 'vue'
import {
  clampPan,
  clampScale,
  computeMaxScale,
  zoomAroundPoint,
  type Dimensions,
  type ZoomTransform,
} from '@/utils/pinchZoomMath'

export interface StageRect {
  left: number
  top: number
  width: number
  height: number
}

export interface UsePinchZoomOptions {
  getStageRect?: () => StageRect | null
  getImageSize?: () => Dimensions
  getNaturalSize?: () => Dimensions
  minScale?: number
  maxScale?: number
  doubleTapScale?: number
  swipeThresholdPx?: number
  onSwipePrev?: () => void
  onSwipeNext?: () => void
  onZoomChange?: (isZoomed: boolean) => void
}

interface PointerPoint {
  clientX: number
  clientY: number
}

export function usePinchZoom(options: UsePinchZoomOptions = {}) {
  const minScale = options.minScale ?? 1
  const hardMaxScale = options.maxScale ?? 8
  const doubleTapTargetScale = options.doubleTapScale ?? 2.5
  const swipeThresholdPx = options.swipeThresholdPx ?? 50

  const scale = ref<number>(1)
  const tx = ref<number>(0)
  const ty = ref<number>(0)
  const isInteracting = ref<boolean>(false)

  const activePointers = new Map<number, PointerPoint>()
  let lastPinchDist = 0
  let lastPinchMid = { x: 0, y: 0 }
  let singleStart = { x: 0, y: 0 }
  let lastSinglePos = { x: 0, y: 0 }
  let wasMultiTouch = false
  let hasMovedSignificantly = false

  let lastTapTime = 0
  let lastTapX = 0
  let lastTapY = 0
  let lastDoubleTapToggleTime = 0
  let didDoubleTapOnDown = false

  const isZoomed = computed(() => scale.value > 1.01)

  const transformStyle = computed(() => {
    if (scale.value <= 1.001 && tx.value === 0 && ty.value === 0) {
      return 'translate3d(0px, 0px, 0px) scale(1)'
    }
    return `translate3d(${Math.round(tx.value * 100) / 100}px, ${Math.round(ty.value * 100) / 100}px, 0px) scale(${Math.round(scale.value * 1000) / 1000})`
  })

  function getStageDimensions(): Dimensions {
    const rect = options.getStageRect?.()
    if (rect && rect.width > 0 && rect.height > 0) {
      return { width: rect.width, height: rect.height }
    }
    const imgSize = options.getImageSize?.()
    if (imgSize && imgSize.width > 0 && imgSize.height > 0) {
      return imgSize
    }
    return { width: 0, height: 0 }
  }

  function getImageDimensions(): Dimensions {
    const imgSize = options.getImageSize?.()
    if (imgSize && imgSize.width > 0 && imgSize.height > 0) {
      return imgSize
    }
    return getStageDimensions()
  }

  function getEffectiveMaxScale(): number {
    const displayed = getImageDimensions()
    const natural = options.getNaturalSize?.() ?? { width: 0, height: 0 }
    return computeMaxScale(displayed, natural, Math.min(4, hardMaxScale), hardMaxScale)
  }

  function clientToFocalOffset(clientX: number, clientY: number): { focalX: number; focalY: number } {
    const rect = options.getStageRect?.()
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return { focalX: 0, focalY: 0 }
    }
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    return {
      focalX: clientX - centerX,
      focalY: clientY - centerY,
    }
  }

  function applyTransform(next: ZoomTransform) {
    const prevZoomed = isZoomed.value
    const clamped = clampPan(next, getStageDimensions(), getImageDimensions())
    scale.value = clamped.scale
    tx.value = clamped.tx
    ty.value = clamped.ty

    const nowZoomed = isZoomed.value
    if (prevZoomed !== nowZoomed) {
      options.onZoomChange?.(nowZoomed)
    }
  }

  function reset() {
    activePointers.clear()
    isInteracting.value = false
    wasMultiTouch = false
    applyTransform({ scale: 1, tx: 0, ty: 0 })
  }

  function zoomToAtClientPoint(targetScale: number, clientX: number, clientY: number) {
    const { focalX, focalY } = clientToFocalOffset(clientX, clientY)
    const zoomed = zoomAroundPoint(
      { scale: scale.value, tx: tx.value, ty: ty.value },
      targetScale,
      focalX,
      focalY,
      minScale,
      getEffectiveMaxScale(),
    )
    applyTransform(zoomed)
  }

  function toggleZoomAtClientPoint(clientX: number, clientY: number) {
    if (isZoomed.value) {
      reset()
    } else {
      const target = clampScale(doubleTapTargetScale, minScale, getEffectiveMaxScale())
      zoomToAtClientPoint(target, clientX, clientY)
    }
  }

  function zoomIn() {
    const rect = options.getStageRect?.()
    const cx = rect ? rect.left + rect.width / 2 : 0
    const cy = rect ? rect.top + rect.height / 2 : 0
    zoomToAtClientPoint(scale.value * 1.5, cx, cy)
  }

  function zoomOut() {
    const rect = options.getStageRect?.()
    const cx = rect ? rect.left + rect.width / 2 : 0
    const cy = rect ? rect.top + rect.height / 2 : 0
    const next = scale.value / 1.5
    if (next <= 1.1) {
      reset()
    } else {
      zoomToAtClientPoint(next, cx, cy)
    }
  }

  function handlePointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return

    const target = e.currentTarget as HTMLElement | null
    if (target && typeof target.setPointerCapture === 'function') {
      try {
        target.setPointerCapture(e.pointerId)
      } catch {
        // Ignorer dersom setPointerCapture feiler i syntetiske tester
      }
    }

    activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY })

    if (activePointers.size === 1) {
      const now = Date.now()
      didDoubleTapOnDown = false

      if (
        e.pointerType !== 'mouse' &&
        now - lastTapTime <= 300 &&
        Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) <= 32
      ) {
        lastTapTime = 0
        lastDoubleTapToggleTime = now
        didDoubleTapOnDown = true
        toggleZoomAtClientPoint(e.clientX, e.clientY)
        return
      }

      singleStart = { x: e.clientX, y: e.clientY }
      lastSinglePos = { x: e.clientX, y: e.clientY }
      wasMultiTouch = false
      hasMovedSignificantly = false
      if (isZoomed.value) {
        isInteracting.value = true
      }
    } else if (activePointers.size >= 2) {
      wasMultiTouch = true
      isInteracting.value = true
      const pts = Array.from(activePointers.values())
      const p1 = pts[0]!
      const p2 = pts[1]!
      lastPinchDist = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY)
      lastPinchMid = {
        x: (p1.clientX + p2.clientX) / 2,
        y: (p1.clientY + p2.clientY) / 2,
      }
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (!activePointers.has(e.pointerId)) return
    activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY })

    if (activePointers.size >= 2) {
      isInteracting.value = true
      const pts = Array.from(activePointers.values())
      const p1 = pts[0]!
      const p2 = pts[1]!
      const dist = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY)
      const mid = {
        x: (p1.clientX + p2.clientX) / 2,
        y: (p1.clientY + p2.clientY) / 2,
      }

      if (lastPinchDist > 0 && dist > 0) {
        const targetScale = scale.value * (dist / lastPinchDist)
        const { focalX, focalY } = clientToFocalOffset(mid.x, mid.y)
        const zoomed = zoomAroundPoint(
          { scale: scale.value, tx: tx.value, ty: ty.value },
          targetScale,
          focalX,
          focalY,
          minScale,
          getEffectiveMaxScale(),
        )
        const panDx = mid.x - lastPinchMid.x
        const panDy = mid.y - lastPinchMid.y
        applyTransform({
          scale: zoomed.scale,
          tx: zoomed.tx + panDx,
          ty: zoomed.ty + panDy,
        })
      }

      lastPinchDist = dist
      lastPinchMid = mid
    } else if (activePointers.size === 1 && !didDoubleTapOnDown) {
      if (Math.hypot(e.clientX - singleStart.x, e.clientY - singleStart.y) > 6) {
        hasMovedSignificantly = true
      }

      if (isZoomed.value && !wasMultiTouch) {
        isInteracting.value = true
        const dx = e.clientX - lastSinglePos.x
        const dy = e.clientY - lastSinglePos.y
        applyTransform({
          scale: scale.value,
          tx: tx.value + dx,
          ty: ty.value + dy,
        })
      }

      lastSinglePos = { x: e.clientX, y: e.clientY }
    }
  }

  function finishPointer(e: PointerEvent, isCancel: boolean) {
    if (!activePointers.has(e.pointerId)) return
    activePointers.delete(e.pointerId)

    if (activePointers.size === 1) {
      const remaining = Array.from(activePointers.values())[0]!
      lastSinglePos = { x: remaining.clientX, y: remaining.clientY }
      return
    }

    if (activePointers.size === 0) {
      isInteracting.value = false

      if (!isCancel && !wasMultiTouch && !didDoubleTapOnDown) {
        if (e.pointerType !== 'mouse' && !hasMovedSignificantly) {
          lastTapTime = Date.now()
          lastTapX = e.clientX
          lastTapY = e.clientY
        }

        if (!isZoomed.value) {
          const totalDx = e.clientX - singleStart.x
          const totalDy = e.clientY - singleStart.y
          if (
            Math.abs(totalDx) >= swipeThresholdPx &&
            Math.abs(totalDx) > Math.abs(totalDy) * 1.4
          ) {
            if (totalDx > 0) {
              options.onSwipePrev?.()
            } else {
              options.onSwipeNext?.()
            }
          }
        }
      }

      didDoubleTapOnDown = false
      wasMultiTouch = false
    }
  }

  function handlePointerUp(e: PointerEvent) {
    finishPointer(e, false)
  }

  function handlePointerCancel(e: PointerEvent) {
    finishPointer(e, true)
  }

  function handleDblClick(e: MouseEvent) {
    if (Date.now() - lastDoubleTapToggleTime < 350) return
    toggleZoomAtClientPoint(e.clientX, e.clientY)
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault()
    const clampedDelta = Math.max(-150, Math.min(150, e.deltaY))
    if (clampedDelta === 0) return
    const factor = Math.exp(-clampedDelta * 0.004)
    const nextScale = scale.value * factor
    if (nextScale <= 1.02 && scale.value <= 1.15 && clampedDelta > 0) {
      reset()
    } else {
      zoomToAtClientPoint(nextScale, e.clientX, e.clientY)
    }
  }

  return {
    scale,
    tx,
    ty,
    isZoomed,
    isInteracting,
    transformStyle,
    reset,
    zoomIn,
    zoomOut,
    zoomToAtClientPoint,
    toggleZoomAtClientPoint,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleDblClick,
    handleWheel,
  }
}
