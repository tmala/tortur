<script setup lang="ts">
import { computed } from 'vue'
import { formatDistance } from '@/composables/useGeolocation'
import type { FlyoverPath, FlyoverSamplePoint } from '@/utils/flyoverPath'

const props = withDefaults(
  defineProps<{
    trackName: string
    path: FlyoverPath
    currentPoint: FlyoverSamplePoint | null
    isFullscreen: boolean
    isPopout?: boolean
  }>(),
  {
    isPopout: false
  }
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'toggle-fullscreen'): void
  (e: 'popout'): void
}>()

const formattedCurrentDistance = computed(() => {
  if (!props.currentPoint) return '0 m'
  return formatDistance(props.currentPoint.distanceMeters)
})

const formattedTotalDistance = computed(() => {
  return formatDistance(props.path.totalDistanceMeters)
})

const compassDirection = computed(() => {
  if (!props.currentPoint) return ''
  const b = (props.currentPoint.bearing + 360) % 360
  if (b >= 337.5 || b < 22.5) return 'N'
  if (b >= 22.5 && b < 67.5) return 'NØ'
  if (b >= 67.5 && b < 112.5) return 'Ø'
  if (b >= 112.5 && b < 157.5) return 'SØ'
  if (b >= 157.5 && b < 202.5) return 'S'
  if (b >= 202.5 && b < 247.5) return 'SV'
  if (b >= 247.5 && b < 292.5) return 'V'
  return 'NV'
})
</script>

<template>
  <header class="flyover-hud-header">
    <div class="hud-top-left">
      <div class="hud-badge">
        <span class="badge-dot"></span>
        <span class="badge-text">3D FILM</span>
      </div>
      <h1 class="hud-track-title" :title="trackName">
        {{ trackName || 'GPS-spor' }}
      </h1>
    </div>

    <div class="hud-top-actions">
      <button
        v-if="!isPopout"
        type="button"
        class="hud-btn"
        title="Åpne i eget vindu"
        aria-label="Åpne i eget vindu"
        @click="emit('popout')"
      >
        <span>↗</span>
      </button>

      <button
        type="button"
        class="hud-btn"
        :title="isFullscreen ? 'Avslutt fullskjerm' : 'Fullskjerm'"
        :aria-label="isFullscreen ? 'Avslutt fullskjerm' : 'Fullskjerm'"
        @click="emit('toggle-fullscreen')"
      >
        <span v-if="isFullscreen">⤢</span>
        <span v-else>⤢</span>
      </button>

      <button
        type="button"
        class="hud-btn hud-btn-close"
        title="Lukk 3D-visning (Esc)"
        aria-label="Lukk 3D-visning"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>
  </header>

  <!-- Flytende statistikk-boks oppe til venstre -->
  <aside class="flyover-stats-card" aria-label="Turdata">
    <div class="stat-item">
      <span class="stat-label">DISTANSE</span>
      <span class="stat-value">
        <strong>{{ formattedCurrentDistance }}</strong>
        <span class="stat-sub"> / {{ formattedTotalDistance }}</span>
      </span>
    </div>

    <div v-if="currentPoint?.ele !== undefined" class="stat-item">
      <span class="stat-label">HØYDE</span>
      <span class="stat-value">
        <strong>{{ Math.round(currentPoint.ele) }}</strong>
        <span class="stat-sub"> m.o.h.</span>
      </span>
    </div>

    <div v-if="currentPoint" class="stat-item stat-item-compass">
      <span class="stat-label">RETNING</span>
      <span class="stat-value">
        <strong>{{ compassDirection }}</strong>
        <span class="stat-sub"> {{ Math.round(currentPoint.bearing) }}°</span>
      </span>
    </div>
  </aside>
</template>

<style scoped>
.flyover-hud-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.85) 0%, rgba(15, 23, 42, 0.2) 80%, transparent 100%);
  z-index: 1000;
  pointer-events: none;
}

.hud-top-left {
  display: flex;
  align-items: center;
  gap: 10px;
  pointer-events: auto;
  overflow: hidden;
}

.hud-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(249, 115, 22, 0.2);
  border: 1px solid rgba(249, 115, 22, 0.5);
  color: #fb923c;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 2px 8px;
  border-radius: 20px;
  flex-shrink: 0;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f97316;
  box-shadow: 0 0 6px #f97316;
  animation: pulse 1.6s infinite ease-in-out;
}

@keyframes pulse {
  0%, 100% { opacity: 0.5; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.2); }
}

.hud-track-title {
  color: #f8fafc;
  font-size: 1.05rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}

.hud-top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: auto;
}

.hud-btn {
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #e2e8f0;
  font-size: 1rem;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.hud-btn:hover {
  background: rgba(30, 41, 59, 0.9);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.3);
  transform: scale(1.05);
}

.hud-btn-close:hover {
  background: rgba(239, 68, 68, 0.85);
  border-color: rgba(239, 68, 68, 0.9);
}

.flyover-stats-card {
  position: absolute;
  top: 66px;
  left: 14px;
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 1000;
  pointer-events: auto;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.stat-item {
  display: flex;
  flex-direction: column;
}

.stat-label {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.stat-value {
  color: #f1f5f9;
  font-size: 0.9rem;
}

.stat-value strong {
  font-size: 1.05rem;
  font-weight: 700;
  color: #ffffff;
}

.stat-sub {
  color: #cbd5e1;
  font-size: 0.8rem;
}
</style>
