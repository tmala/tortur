export interface ZoomTransform {
  scale: number
  tx: number
  ty: number
}

export interface Dimensions {
  width: number
  height: number
}

function normalizeZero(val: number): number {
  return Object.is(val, -0) || Math.abs(val) < 1e-9 ? 0 : val
}

/**
 * Begrenser zoom-skala til intervallet [minScale, maxScale].
 */
export function clampScale(scale: number, minScale = 1, maxScale = 8): number {
  if (!Number.isFinite(scale)) return minScale
  const effectiveMax = Math.max(minScale, maxScale)
  return Math.min(effectiveMax, Math.max(minScale, scale))
}

/**
 * Beregner anbefalt maksimal zoom-skala ut fra bildets viste og naturlige dimensjoner.
 */
export function computeMaxScale(
  displayedSize: Dimensions,
  naturalSize: Dimensions,
  minMaxScale = 4,
  hardCapScale = 8,
): number {
  if (
    displayedSize.width <= 0 ||
    displayedSize.height <= 0 ||
    naturalSize.width <= 0 ||
    naturalSize.height <= 0
  ) {
    return clampScale(minMaxScale, 1, hardCapScale)
  }

  const ratioW = naturalSize.width / displayedSize.width
  const ratioH = naturalSize.height / displayedSize.height
  const naturalRatio = Math.max(ratioW, ratioH)

  return clampScale(Math.max(minMaxScale, naturalRatio), 1, hardCapScale)
}

/**
 * Beregner ny zoom-transformasjon slik at punktet (focalX, focalY) —
 * målt relativt til senter av rammen (0, 0) — holder seg på samme sted under fingrene/pekeren.
 */
export function zoomAroundPoint(
  state: ZoomTransform,
  targetScale: number,
  focalX: number,
  focalY: number,
  minScale = 1,
  maxScale = 8,
): ZoomTransform {
  const nextScale = clampScale(targetScale, minScale, maxScale)
  if (nextScale <= minScale + 0.001) {
    return { scale: minScale, tx: 0, ty: 0 }
  }

  const currentScale = state.scale > 0 ? state.scale : 1
  const ratio = nextScale / currentScale

  const tx = normalizeZero(focalX - ratio * (focalX - state.tx))
  const ty = normalizeZero(focalY - ratio * (focalY - state.ty))

  return {
    scale: nextScale,
    tx,
    ty,
  }
}

/**
 * Begrenser panorering (tx, ty) slik at bildet ikke kan dras lenger enn bildets ytterkanter,
 * og sentrerer bildet på aksen dersom det skalerte bildet fortsatt er mindre enn rammen.
 */
export function clampPan(
  state: ZoomTransform,
  stageSize: Dimensions,
  imageSize: Dimensions,
): ZoomTransform {
  if (state.scale <= 1.001) {
    return { scale: 1, tx: 0, ty: 0 }
  }

  const baseW = imageSize.width > 0 ? imageSize.width : stageSize.width
  const baseH = imageSize.height > 0 ? imageSize.height : stageSize.height
  const viewportW = stageSize.width > 0 ? stageSize.width : baseW
  const viewportH = stageSize.height > 0 ? stageSize.height : baseH

  if (baseW <= 0 || baseH <= 0) {
    return {
      scale: state.scale,
      tx: normalizeZero(state.tx),
      ty: normalizeZero(state.ty),
    }
  }

  const scaledW = baseW * state.scale
  const scaledH = baseH * state.scale

  const maxTx = Math.max(0, (scaledW - viewportW) / 2)
  const maxTy = Math.max(0, (scaledH - viewportH) / 2)

  const tx = normalizeZero(Math.min(maxTx, Math.max(-maxTx, state.tx)))
  const ty = normalizeZero(Math.min(maxTy, Math.max(-maxTy, state.ty)))

  return {
    scale: state.scale,
    tx,
    ty,
  }
}

/**
 * Returnerer høyoppløselig (=s0) URL for Google Drive lh3-bilder slik at bildet
 * forblir skarpt når brukeren zoomer inn.
 */
export function getFullSizePhotoUrl(
  urlOrPhoto: string | { url?: string | null } | null | undefined,
): string {
  const rawUrl =
    typeof urlOrPhoto === 'string'
      ? urlOrPhoto.trim()
      : typeof urlOrPhoto?.url === 'string'
        ? urlOrPhoto.url.trim()
        : ''

  if (!rawUrl) return ''

  if (/^https:\/\/lh3\.googleusercontent\.com\/d\/[^/?#=]+$/.test(rawUrl)) {
    return `${rawUrl}=s0`
  }

  if (/^https:\/\/lh3\.googleusercontent\.com\/d\/[^/?#=]+=(?:s|w)\d+$/.test(rawUrl)) {
    return rawUrl.replace(/=(?:s|w)\d+$/, '=s0')
  }

  return rawUrl
}
