<script setup lang="ts">
import { ref, onMounted, onUnmounted, useTemplateRef } from 'vue'
import { Layers } from 'lucide-vue-next'
import MapLayerModal from './header/MapLayerModal.vue'

withDefaults(
  defineProps<{
    activeLayer: string
    isLoggedIn?: boolean
    isAdmin?: boolean
    mapboxToken?: string
    cartoApiKey?: string
  }>(),
  {
    isLoggedIn: false,
    isAdmin: false,
    mapboxToken: '',
    cartoApiKey: '',
  },
)

const emit = defineEmits<{
  (e: 'change-layer', layerId: string): void
}>()

const isOpen = ref(false)
const wrapperRef = useTemplateRef<HTMLElement>('wrapperRef')

function toggleOpen() {
  isOpen.value = !isOpen.value
}

function handleClose() {
  isOpen.value = false
}

function handleLayerChange(layerId: string) {
  emit('change-layer', layerId)
  isOpen.value = false
}

function handleClickOutside(e: MouseEvent) {
  if (!isOpen.value) return
  const target = e.target as HTMLElement | null
  if (wrapperRef.value && target && !wrapperRef.value.contains(target)) {
    isOpen.value = false
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isOpen.value) {
    isOpen.value = false
  }
}

onMounted(() => {
  window.addEventListener('click', handleClickOutside)
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('click', handleClickOutside)
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div ref="wrapperRef" class="map-layer-wrapper">
    <!-- Kartlag-velgermeny -->
    <MapLayerModal
      :is-open="isOpen"
      :active-layer="activeLayer"
      :is-logged-in="isLoggedIn"
      :is-admin="isAdmin"
      :mapbox-token="mapboxToken"
      :carto-api-key="cartoApiKey"
      @close="handleClose"
      @change-layer="handleLayerChange"
    />

    <!-- Frittstående kartvelger-knapp -->
    <button
      type="button"
      class="btn-layer-toggle glass-panel"
      :class="{ active: isOpen }"
      @click.stop="toggleOpen"
      title="Bytt kartlag"
      aria-label="Bytt kartlag"
      :aria-expanded="isOpen"
    >
      <Layers :size="20" class="layers-icon" />
    </button>
  </div>
</template>

<style scoped>
.glass-panel {
  pointer-events: auto;
  border-radius: 12px;
}

.map-layer-wrapper {
  position: absolute;
  /* Litt lavere enn før, men over den avrundede skjermkanten (safe-area-inset-bottom) */
  bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  left: calc(16px + env(safe-area-inset-left, 0px));
  z-index: 1050;
  display: flex;
  flex-direction: column-reverse;
  align-items: flex-start;
  gap: 10px;
  pointer-events: auto;
}

.btn-layer-toggle {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  transition: all 0.2s ease;
  user-select: none;
  -webkit-user-select: none;
}

.btn-layer-toggle:hover {
  background: #1e293b;
  border-color: #38bdf8;
  color: #38bdf8;
  transform: translateY(-1px);
}

.btn-layer-toggle.active {
  background: rgba(56, 189, 248, 0.2);
  border-color: #38bdf8;
  color: #38bdf8;
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.3);
}

.layers-icon {
  flex-shrink: 0;
}
</style>
