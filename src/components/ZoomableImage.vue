<script setup lang="ts">
import { ref, computed, watch, useTemplateRef } from 'vue'
import { RotateCcw } from '@lucide/vue'
import { usePinchZoom } from '@/composables/usePinchZoom'
import { getFullSizePhotoUrl } from '@/utils/pinchZoomMath'

const props = withDefaults(
  defineProps<{
    src: string
    fullSrc?: string
    fallbackSrc?: string
    alt: string
    maxScale?: number
  }>(),
  {
    fullSrc: undefined,
    fallbackSrc: undefined,
    maxScale: 8,
  },
)

const emit = defineEmits<{
  (e: 'swipe-prev'): void
  (e: 'swipe-next'): void
  (e: 'zoom-change', isZoomed: boolean): void
}>()

const stageEl = useTemplateRef<HTMLDivElement>('stageEl')
const imgEl = useTemplateRef<HTMLImageElement>('imgEl')

const currentSrc = ref<string>(props.src)
const fullSrcFailed = ref<boolean>(false)

const effectiveFullSrc = computed(() => {
  if (props.fullSrc) return props.fullSrc
  return getFullSizePhotoUrl(props.src)
})

const {
  scale,
  isZoomed,
  isInteracting,
  transformStyle,
  reset,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
  handlePointerCancel,
  handleDblClick,
  handleWheel,
} = usePinchZoom({
  getStageRect: () => {
    const el = stageEl.value
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  },
  getImageSize: () => {
    const el = imgEl.value
    if (!el) return { width: 0, height: 0 }
    const r = el.getBoundingClientRect()
    const currentScale = scale.value > 0 ? scale.value : 1
    return {
      width: (r.width || el.clientWidth || 0) / currentScale,
      height: (r.height || el.clientHeight || 0) / currentScale,
    }
  },
  getNaturalSize: () => {
    const el = imgEl.value
    if (!el) return { width: 0, height: 0 }
    return {
      width: el.naturalWidth || 0,
      height: el.naturalHeight || 0,
    }
  },
  maxScale: props.maxScale,
  onSwipePrev: () => emit('swipe-prev'),
  onSwipeNext: () => emit('swipe-next'),
  onZoomChange: (zoomed) => {
    if (
      zoomed &&
      !fullSrcFailed.value &&
      effectiveFullSrc.value &&
      currentSrc.value !== effectiveFullSrc.value &&
      currentSrc.value === props.src
    ) {
      currentSrc.value = effectiveFullSrc.value
    }
    emit('zoom-change', zoomed)
  },
})

const zoomLabel = computed(() => `${Math.round(scale.value * 10) / 10}×`)

watch(
  () => props.src,
  (newSrc) => {
    fullSrcFailed.value = false
    currentSrc.value = newSrc
    reset()
  },
)

function handleImageError() {
  if (
    !fullSrcFailed.value &&
    effectiveFullSrc.value &&
    currentSrc.value === effectiveFullSrc.value &&
    effectiveFullSrc.value !== props.src
  ) {
    fullSrcFailed.value = true
    currentSrc.value = props.src
    return
  }

  if (props.fallbackSrc && currentSrc.value !== props.fallbackSrc) {
    currentSrc.value = props.fallbackSrc
  }
}

defineExpose({
  reset,
  isZoomed,
  scale,
})
</script>

<template>
  <div
    ref="stageEl"
    class="zoomable-stage"
    :class="{ 'is-zoomed': isZoomed, 'is-interacting': isInteracting }"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerCancel"
    @dblclick="handleDblClick"
    @wheel="handleWheel"
  >
    <img
      ref="imgEl"
      :src="currentSrc"
      :alt="alt"
      class="zoomable-image lightbox-image"
      :style="{ transform: transformStyle }"
      draggable="false"
      @error="handleImageError"
    />

    <button
      v-if="isZoomed"
      type="button"
      class="btn-reset-zoom"
      aria-label="Tilbakestill zoom"
      title="Tilbakestill zoom"
      @pointerdown.stop
      @click.stop="reset"
    >
      <RotateCcw :size="14" />
      <span>{{ zoomLabel }}</span>
    </button>
  </div>
</template>

<style scoped>
.zoomable-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  cursor: zoom-in;
  max-width: 100%;
}

.zoomable-stage.is-zoomed {
  cursor: grab;
}

.zoomable-stage.is-zoomed.is-interacting {
  cursor: grabbing;
}

.zoomable-image {
  max-width: min(94vw, 100%);
  max-height: 78vh;
  max-height: 78dvh;
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
  -webkit-touch-callout: none;
  transform-origin: center center;
  will-change: transform;
  transition: transform 0.14s ease-out;
}

.zoomable-stage.is-interacting .zoomable-image {
  transition: none;
}

.btn-reset-zoom {
  position: absolute;
  bottom: 10px;
  right: 10px;
  z-index: 12;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.35);
  color: #f8fafc;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  transition: background 0.15s ease, border-color 0.15s ease;
}

.btn-reset-zoom:hover {
  background: rgba(56, 189, 248, 0.85);
  border-color: #38bdf8;
  color: #ffffff;
}

@media (max-width: 640px) {
  .zoomable-image {
    max-width: 96vw;
    max-height: 76vh;
    max-height: 76dvh;
  }
}
</style>
