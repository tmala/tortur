<script setup lang="ts">
import { computed } from 'vue'
import { Check, ExternalLink } from 'lucide-vue-next'
import { MAP_LAYERS } from '@/config/mapLayers'

const props = defineProps<{
  isOpen: boolean
  activeLayer: string
  isLoggedIn?: boolean
  isAdmin?: boolean
  mapboxToken?: string
  cartoApiKey?: string
  showHikingTrails?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'change-layer', layerId: string): void
  (e: 'toggle-hiking-trails'): void
  (e: 'open-3d'): void
}>()

const availableLayers = computed(() => {
  return MAP_LAYERS.filter((layer) => {
    if (layer.requiresAdmin && !props.isAdmin) return false
    if (layer.requiresAuth && !props.isLoggedIn) return false
    if (layer.requiresMapboxToken && !props.mapboxToken) return false
    if (layer.requiresCartoKey && !props.cartoApiKey) return false
    return true
  })
    .slice()
    .sort((a, b) => a.sortnum - b.sortnum)
})

const selectLayer = (layerId: string) => {
  emit('change-layer', layerId)
  emit('close')
}

const handleOpen3D = () => {
  emit('open-3d')
  emit('close')
}
</script>

<template>
  <transition name="fade-slide">
    <div v-if="isOpen" class="layer-modal glass-panel" @click.stop>
      <div class="layer-modal-header">
        <h3>Velg kartvisning</h3>
        <button class="btn-close" @click="emit('close')">✕</button>
      </div>
      <div class="layer-options">
        <button
          v-for="layer in availableLayers"
          :key="layer.id"
          class="layer-item"
          :class="{ selected: activeLayer === layer.id }"
          @click="selectLayer(layer.id)"
        >
          <div class="layer-info">
            <span class="layer-name">{{ layer.name }}</span>
            <span class="layer-desc">{{ layer.desc }}</span>
          </div>
          <Check v-if="activeLayer === layer.id" :size="18" class="check-icon" />
        </button>
      </div>

      <!-- Kartoverlegg (Overlays) -->
      <div class="layer-overlay-section">
        <div class="layer-section-title">Kartoverlegg</div>
        <button
          type="button"
          class="layer-item overlay-toggle"
          :class="{ selected: showHikingTrails }"
          @click="emit('toggle-hiking-trails')"
        >
          <div class="layer-info">
            <span class="layer-name">Merkede turstier (Waymarked)</span>
            <span class="layer-desc">Røde T-ruter og merkede vandrestier</span>
          </div>
          <Check v-if="showHikingTrails" :size="18" class="check-icon" />
        </button>
      </div>

      <!-- 3D Visning (Kun admin med Mapbox-token) -->
      <div v-if="isAdmin && mapboxToken" class="layer-overlay-section">
        <div class="layer-section-title">3D-visning</div>
        <button
          type="button"
          class="layer-item action-3d"
          @click="handleOpen3D"
        >
          <div class="layer-info">
            <span class="layer-name">🏔️ Åpne 3D-terrengvisning</span>
            <span class="layer-desc">Ekte 3D med Mapbox terreng og rotasjon</span>
          </div>
          <ExternalLink :size="16" class="check-icon" />
        </button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.glass-panel {
  pointer-events: auto;
  border-radius: 16px;
}

.layer-modal {
  position: relative;
  width: 320px;
  max-width: calc(100vw - 32px);
  max-height: calc(
    100dvh - 120px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)
  );
  overflow-y: auto;
  padding: 10px 12px;
  z-index: 20;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85);
}

.layer-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #334155;
}

.layer-modal-header h3 {
  font-size: 14px;
  font-weight: 700;
  color: #f8fafc;
}

.btn-close {
  background: #334155;
  border: none;
  color: #cbd5e1;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}

.btn-close:hover {
  color: white;
  background: #475569;
}

.layer-options {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.layer-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  color: #f8fafc;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.layer-item:hover {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
}

.layer-item.selected {
  background: #1e3a5f;
  border-color: #38bdf8;
}

.layer-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.layer-name {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.25;
}

.layer-desc {
  font-size: 10.5px;
  color: #94a3b8;
  line-height: 1.2;
}

.check-icon {
  color: #38bdf8;
  flex-shrink: 0;
  margin-left: 8px;
}

.layer-overlay-section {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #334155;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.layer-section-title {
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 2px;
  padding-left: 2px;
}

@media (max-width: 640px) {
  .layer-modal {
    width: calc(100vw - 32px);
    max-width: calc(100vw - 32px);
    max-height: calc(
      100dvh - 140px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)
    );
    padding: 10px;
  }
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.25s ease-out;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
