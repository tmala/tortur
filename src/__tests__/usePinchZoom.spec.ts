import { describe, it, expect, vi } from 'vitest'
import { usePinchZoom } from '@/composables/usePinchZoom'

function createPointerEvent(
  type: string,
  init: {
    pointerId: number
    clientX: number
    clientY: number
    pointerType?: string
    button?: number
  },
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: init.pointerId,
    clientX: init.clientX,
    clientY: init.clientY,
    pointerType: init.pointerType ?? 'touch',
    button: init.button ?? 0,
  })
}

describe('usePinchZoom', () => {
  const defaultRect = () => ({ left: 0, top: 0, width: 400, height: 300 })
  const defaultImgSize = () => ({ width: 400, height: 300 })
  const defaultNaturalSize = () => ({ width: 2400, height: 1800 })

  it('zoomer inn når to fingre knipes fra hverandre (anti-kniping)', () => {
    const onZoomChange = vi.fn()
    const pz = usePinchZoom({
      getStageRect: defaultRect,
      getImageSize: defaultImgSize,
      getNaturalSize: defaultNaturalSize,
      onZoomChange,
    })

    expect(pz.scale.value).toBe(1)
    expect(pz.isZoomed.value).toBe(false)

    // To fingre starter 100px fra hverandre rundt senter (200, 150)
    pz.handlePointerDown(createPointerEvent('pointerdown', { pointerId: 1, clientX: 150, clientY: 150 }))
    pz.handlePointerDown(createPointerEvent('pointerdown', { pointerId: 2, clientX: 250, clientY: 150 }))

    // Fingrene flyttes til 200px fra hverandre (2x avstand)
    pz.handlePointerMove(createPointerEvent('pointermove', { pointerId: 1, clientX: 100, clientY: 150 }))
    pz.handlePointerMove(createPointerEvent('pointermove', { pointerId: 2, clientX: 300, clientY: 150 }))

    expect(pz.scale.value).toBeCloseTo(2, 2)
    expect(pz.isZoomed.value).toBe(true)
    expect(onZoomChange).toHaveBeenCalledWith(true)

    pz.handlePointerUp(createPointerEvent('pointerup', { pointerId: 1, clientX: 100, clientY: 150 }))
    pz.handlePointerUp(createPointerEvent('pointerup', { pointerId: 2, clientX: 300, clientY: 150 }))
  })

  it('panorerer bildet med én finger når bildet er zoomet inn', () => {
    const pz = usePinchZoom({
      getStageRect: defaultRect,
      getImageSize: defaultImgSize,
      getNaturalSize: defaultNaturalSize,
    })

    // Zoom til 2x først
    pz.zoomToAtClientPoint(2, 200, 150)
    expect(pz.scale.value).toBe(2)

    pz.handlePointerDown(createPointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 150 }))
    pz.handlePointerMove(createPointerEvent('pointermove', { pointerId: 1, clientX: 260, clientY: 110 }))
    pz.handlePointerUp(createPointerEvent('pointerup', { pointerId: 1, clientX: 260, clientY: 110 }))

    expect(pz.tx.value).toBe(60)
    expect(pz.ty.value).toBe(-40)
  })

  it('veksler zoom ved dobbeltklikk og ved raskt dobbelttrykk på touch', () => {
    const pz = usePinchZoom({
      getStageRect: defaultRect,
      getImageSize: defaultImgSize,
      getNaturalSize: defaultNaturalSize,
    })

    // Dobbelttrykk på touch
    pz.handlePointerDown(createPointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 150 }))
    pz.handlePointerUp(createPointerEvent('pointerup', { pointerId: 1, clientX: 200, clientY: 150 }))
    pz.handlePointerDown(createPointerEvent('pointerdown', { pointerId: 2, clientX: 202, clientY: 151 }))
    pz.handlePointerUp(createPointerEvent('pointerup', { pointerId: 2, clientX: 202, clientY: 151 }))

    expect(pz.isZoomed.value).toBe(true)
    expect(pz.scale.value).toBeCloseTo(2.5, 2)

    // Nytt dobbelttrykk nullstiller til 1x
    pz.handlePointerDown(createPointerEvent('pointerdown', { pointerId: 3, clientX: 200, clientY: 150 }))
    pz.handlePointerUp(createPointerEvent('pointerup', { pointerId: 3, clientX: 200, clientY: 150 }))
    pz.handlePointerDown(createPointerEvent('pointerdown', { pointerId: 4, clientX: 200, clientY: 150 }))
    pz.handlePointerUp(createPointerEvent('pointerup', { pointerId: 4, clientX: 200, clientY: 150 }))

    expect(pz.isZoomed.value).toBe(false)
    expect(pz.scale.value).toBe(1)
  })

  it('utløser onSwipePrev og onSwipeNext ved horisontalt sveip i 1x-visning, men ikke når zoomet', () => {
    const onSwipePrev = vi.fn()
    const onSwipeNext = vi.fn()
    const pz = usePinchZoom({
      getStageRect: defaultRect,
      getImageSize: defaultImgSize,
      onSwipePrev,
      onSwipeNext,
    })

    // Sveip mot venstre -> neste bilde
    pz.handlePointerDown(createPointerEvent('pointerdown', { pointerId: 10, clientX: 300, clientY: 150 }))
    pz.handlePointerMove(createPointerEvent('pointermove', { pointerId: 10, clientX: 180, clientY: 155 }))
    pz.handlePointerUp(createPointerEvent('pointerup', { pointerId: 10, clientX: 180, clientY: 155 }))
    expect(onSwipeNext).toHaveBeenCalledTimes(1)

    // Sveip mot høyre -> forrige bilde
    pz.handlePointerDown(createPointerEvent('pointerdown', { pointerId: 11, clientX: 120, clientY: 150 }))
    pz.handlePointerMove(createPointerEvent('pointermove', { pointerId: 11, clientX: 250, clientY: 148 }))
    pz.handlePointerUp(createPointerEvent('pointerup', { pointerId: 11, clientX: 250, clientY: 148 }))
    expect(onSwipePrev).toHaveBeenCalledTimes(1)

    // Når zoomet inn skal drag panorere i stedet for å bytte bilde
    pz.zoomToAtClientPoint(2, 200, 150)
    pz.handlePointerDown(createPointerEvent('pointerdown', { pointerId: 12, clientX: 300, clientY: 150 }))
    pz.handlePointerMove(createPointerEvent('pointermove', { pointerId: 12, clientX: 150, clientY: 150 }))
    pz.handlePointerUp(createPointerEvent('pointerup', { pointerId: 12, clientX: 150, clientY: 150 }))
    expect(onSwipeNext).toHaveBeenCalledTimes(1)
  })

  it('zoomer med musehjul / trackpad (wheel)', () => {
    const pz = usePinchZoom({
      getStageRect: defaultRect,
      getImageSize: defaultImgSize,
      getNaturalSize: defaultNaturalSize,
    })

    const wheelIn = new WheelEvent('wheel', { deltaY: -100, clientX: 200, clientY: 150, cancelable: true })
    pz.handleWheel(wheelIn)

    expect(pz.scale.value).toBeGreaterThan(1.3)
    expect(pz.isZoomed.value).toBe(true)

    pz.reset()
    expect(pz.scale.value).toBe(1)
    expect(pz.isZoomed.value).toBe(false)
  })
})
