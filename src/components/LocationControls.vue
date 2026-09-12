<script setup lang="ts">
import { watch, onUnmounted } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import type { GeoLocationState } from '@/composables/useGeolocation'

const props = defineProps<{
  userLocation: GeoLocationState | null
  centerCoords: { lat: number; lng: number; zoom: number } | null
  error: string | null
  isLocating?: boolean
}>()

const emit = defineEmits<{
  (e: 'locate'): void
  (e: 'clear-error'): void
}>()

// Automatisk lukking av feilmelding etter 8 sekunder så den aldri blir stående i veien
let errorTimeout: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.error,
  (newVal) => {
    if (errorTimeout) {
      clearTimeout(errorTimeout)
      errorTimeout = null
    }
    if (newVal) {
      errorTimeout = setTimeout(() => {
        emit('clear-error')
        errorTimeout = null
      }, 8000)
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (errorTimeout) {
    clearTimeout(errorTimeout)
    errorTimeout = null
  }
})
</script>

<template>
  <div class="controls-overlay">
    <!-- Bunnkontrollpanel (Statuskapsel og varsler – trygt forankret i bunn) -->
    <div class="bottom-bar">
      <!-- Feilmelding / Varsel – plassert i bunnområdet slik at den ALDRI dekker over hovedmenyen øverst -->
      <transition name="bounce">
        <div v-if="error" class="error-banner glass-panel">
          <div class="error-content">
            <AlertTriangle :size="20" class="error-icon" />
            <div class="error-text">
              <span>{{ error }}</span>
            </div>
          </div>
          <div class="error-actions">
            <button class="btn-retry" @click="emit('locate')">Prøv igjen</button>
            <button class="btn-dismiss" @click="emit('clear-error')">Lukk</button>
          </div>
        </div>
      </transition>

      <!-- Statuskapsel (Koordinater & Nøyaktighet) -->
      <div class="status-pill glass-panel">
        <div v-if="userLocation" class="loc-data">
          <span class="status-dot online"></span>
          <span class="loc-text">
            {{ userLocation.lat.toFixed(4) }}°, {{ userLocation.lng.toFixed(4) }}°
          </span>
          <span v-if="userLocation.accuracy" class="accuracy-badge">
            ±{{ Math.round(userLocation.accuracy) }}m
          </span>
        </div>
        <div v-else-if="centerCoords" class="loc-data">
          <span class="status-dot idle"></span>
          <span class="loc-text muted">
            Senter: {{ centerCoords.lat.toFixed(4) }}°, {{ centerCoords.lng.toFixed(4) }}° (Zoom
            {{ centerCoords.zoom }})
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.controls-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 16px;
  box-sizing: border-box;
}

.glass-panel {
  pointer-events: auto;
  border-radius: 16px;
}

/* Feilbanner - trygt plassert i bunnområdet slik at hovedmenyen aldri tildekkes */
.error-banner {
  align-self: center;
  max-width: 480px;
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #ef4444 !important;
  background: #1e1b2e !important;
  border-radius: 14px;
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.8),
    0 0 0 1px rgba(239, 68, 68, 0.3);
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 100;
  pointer-events: auto;
}

.error-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.error-icon {
  color: #f87171;
  flex-shrink: 0;
}

.error-text {
  font-size: 14px;
  font-weight: 500;
  color: #f8fafc;
  line-height: 1.4;
}

.error-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-retry {
  background: #dc2626;
  color: #ffffff;
  border: 1px solid #ef4444;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-retry:hover {
  background: #b91c1c;
}

.btn-dismiss {
  background: #334155;
  color: #f8fafc;
  border: 1px solid #475569;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-dismiss:hover {
  background: #475569;
}

/* Bunnlinje */
.bottom-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  margin-top: auto;
  margin-bottom: env(safe-area-inset-bottom, 0px);
  pointer-events: none;
}

/* Statuskapsel */
.status-pill {
  padding: 6px 14px;
  font-size: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

.loc-data {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.online {
  background-color: var(--success);
  box-shadow: 0 0 8px var(--success);
}

.status-dot.idle {
  background-color: var(--text-muted);
}

.loc-text {
  font-weight: 500;
  color: #f8fafc;
}

.loc-text.muted {
  color: #94a3b8;
}

.accuracy-badge {
  background: rgba(2, 132, 199, 0.2);
  color: var(--accent);
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
}

/* Transisjoner */
.bounce-enter-active {
  animation: bounce-in 0.3s;
}

.bounce-leave-active {
  animation: bounce-in 0.2s reverse;
}

@keyframes bounce-in {
  0% {
    transform: scale(0.9);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
