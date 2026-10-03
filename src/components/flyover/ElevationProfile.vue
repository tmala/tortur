<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import type { FlyoverPath } from '@/utils/flyoverPath'

const props = defineProps<{
  path: FlyoverPath
  progress: number
}>()

const emit = defineEmits<{
  (e: 'seek', progress: number): void
}>()

const svgRef = useTemplateRef<SVGSVGElement>('svgRef')

const width = 360
const height = 54
const paddingY = 6

const hasElevation = computed(() => {
  return (
    props.path.hasElevation &&
    props.path.minElevation !== undefined &&
    props.path.maxElevation !== undefined &&
    props.path.points.length >= 2
  )
})

const pointsData = computed(() => {
  if (!hasElevation.value || !props.path.minElevation || !props.path.maxElevation) {
    return []
  }

  const minE = props.path.minElevation
  const maxE = Math.max(minE + 10, props.path.maxElevation)
  const eleSpan = maxE - minE

  return props.path.points.map((pt) => {
    const x = pt.progress * width
    const eleVal = pt.ele ?? minE
    const norm = (eleVal - minE) / eleSpan
    const y = height - paddingY - norm * (height - paddingY * 2)
    return { x, y }
  })
})

const pathString = computed(() => {
  const pts = pointsData.value
  if (pts.length < 2) return ''

  let d = `M ${pts[0]!.x.toFixed(1)} ${pts[0]!.y.toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i]!.x.toFixed(1)} ${pts[i]!.y.toFixed(1)}`
  }
  return d
})

const areaString = computed(() => {
  const line = pathString.value
  if (!line) return ''
  return `${line} L ${width} ${height} L 0 ${height} Z`
})

const currentMarkerX = computed(() => {
  return Math.max(0, Math.min(width, props.progress * width))
})

const handleSvgClick = (e: MouseEvent) => {
  if (!svgRef.value) return
  const rect = svgRef.value.getBoundingClientRect()
  const clickX = e.clientX - rect.left
  const ratio = Math.max(0, Math.min(1, clickX / rect.width))
  emit('seek', ratio)
}
</script>

<template>
  <div v-if="hasElevation" class="elevation-profile-container" title="Klikk for å spole i høydeprofilen">
    <svg
      ref="svgRef"
      class="elevation-svg"
      :viewBox="`0 0 ${width} ${height}`"
      preserveAspectRatio="none"
      @click="handleSvgClick"
    >
      <defs>
        <linearGradient id="eleGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f97316" stop-opacity="0.45" />
          <stop offset="100%" stop-color="#f97316" stop-opacity="0.02" />
        </linearGradient>
      </defs>

      <!-- Fylt areal under høydeprofil -->
      <path :d="areaString" fill="url(#eleGradient)" />

      <!-- Selve høydelinjen -->
      <path :d="pathString" fill="none" stroke="#ea580c" stroke-width="2" stroke-linecap="round" />

      <!-- Nåværende posisjon (vertikal linje) -->
      <line
        :x1="currentMarkerX"
        y1="0"
        :x2="currentMarkerX"
        :y2="height"
        stroke="#ffffff"
        stroke-width="2"
        stroke-dasharray="2 2"
      />
      <!-- Markørprikk -->
      <circle :cx="currentMarkerX" :cy="height / 2" r="3.5" fill="#38bdf8" stroke="#ffffff" stroke-width="1.5" />
    </svg>

    <div class="elevation-profile-labels">
      <span class="label-min">{{ path.minElevation }}m</span>
      <span class="label-hint">Høydeprofil</span>
      <span class="label-max">{{ path.maxElevation }}m</span>
    </div>
  </div>
</template>

<style scoped>
.elevation-profile-container {
  display: flex;
  flex-direction: column;
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
}

.elevation-svg {
  width: 100%;
  height: 44px;
  overflow: visible;
}

.elevation-profile-labels {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.68rem;
  color: #94a3b8;
  margin-top: 2px;
}

.label-hint {
  color: #64748b;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.label-max {
  color: #f97316;
  font-weight: 600;
}
</style>
