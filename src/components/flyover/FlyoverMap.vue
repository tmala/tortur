<script setup lang="ts">
import { watch, onMounted, onUnmounted, useTemplateRef } from 'vue'
import { useFlyoverMap } from '@/composables/flyover/useFlyoverMap'
import type { FlyoverPath } from '@/utils/flyoverPath'

const props = defineProps<{
  path: FlyoverPath
}>()

const emit = defineEmits<{
  (e: 'map-ready'): void
}>()

const mapContainerRef = useTemplateRef<HTMLDivElement>('mapContainerRef')

const {
  mapInstance,
  isMapReady,
  activeLayerId,
  isTerrainLoaded,
  terrainExaggeration,
  initMap,
  updateProgress,
  changeTileLayer,
  setupTrackLayers,
  createAvatarMarker,
  fitTrackBounds,
  setTerrainExaggeration,
  cleanup
} = useFlyoverMap()

onMounted(async () => {
  if (mapContainerRef.value) {
    await initMap(mapContainerRef.value, props.path)
    emit('map-ready')
  }
})

// Dersom stien oppdateres eller lastes etter at kartet er montert
watch(
  () => props.path,
  (newPath) => {
    if (mapInstance.value && isMapReady.value && newPath && newPath.points.length >= 2) {
      setupTrackLayers(mapInstance.value, newPath)
      createAvatarMarker(mapInstance.value, newPath)
      fitTrackBounds(newPath)
    }
  },
  { deep: false }
)

onUnmounted(() => {
  cleanup()
})

const getCanvas = (): HTMLCanvasElement | null => {
  if (!mapInstance.value) return null
  return mapInstance.value.getCanvas()
}

defineExpose({
  mapInstance,
  isMapReady,
  activeLayerId,
  isTerrainLoaded,
  terrainExaggeration,
  updateProgress,
  changeTileLayer,
  setupTrackLayers,
  createAvatarMarker,
  fitTrackBounds,
  setTerrainExaggeration,
  getCanvas
})
</script>

<template>
  <div class="flyover-map-wrapper">
    <div ref="mapContainerRef" class="flyover-map-container"></div>

    <div v-if="!isMapReady" class="flyover-loading-overlay">
      <div class="spinner"></div>
      <span>Laster 3D-terreng og kartdata...</span>
    </div>
  </div>
</template>

<style scoped>
.flyover-map-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: #0f172a;
}

.flyover-map-container {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
}

.flyover-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: #0f172a;
  color: #f1f5f9;
  font-size: 0.95rem;
  z-index: 2000;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(249, 115, 22, 0.2);
  border-top-color: #f97316;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

<style>
/* Globale stiler for MapLibre 3D markør */
.flyover-avatar-marker {
  position: relative;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.flyover-avatar-pulse {
  position: absolute;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(249, 115, 22, 0.4);
  animation: flyover-pulse 2s infinite ease-out;
}

.flyover-avatar-body {
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #ea580c;
  border: 2.5px solid #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.6);
  z-index: 2;
}

.flyover-avatar-arrow {
  color: #ffffff;
  font-size: 13px;
  line-height: 1;
  display: inline-block;
  transform-origin: center center;
  transition: transform 0.08s linear;
}

@keyframes flyover-pulse {
  0% { transform: scale(0.6); opacity: 0.8; }
  100% { transform: scale(1.6); opacity: 0; }
}

/* Skjul default MapLibre kompass og zoom dersom de dukker opp */
.maplibregl-ctrl-bottom-right,
.maplibregl-ctrl-bottom-left {
  margin-bottom: 90px !important;
}
</style>
