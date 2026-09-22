<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { Mountain, MapPin, X } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    coords: { lat: number; lng: number } | null
    point?: { x: number; y: number } | null
  }>(),
  {
    coords: null,
    point: null
  }
)

const emit = defineEmits<{
  (e: 'create-turpost', coords: { lat: number; lng: number }): void
  (e: 'show-turposter-here', coords: { lat: number; lng: number }): void
  (e: 'close'): void
}>()

const formattedCoords = computed(() => {
  if (!props.coords) return ''
  return `${props.coords.lat.toFixed(5)}, ${props.coords.lng.toFixed(5)}`
})

/**
 * Posisjonerer den flytende menyen optimalt i forhold til trykkpunktet,
 * og forhindrer at menyen havner utenfor skjermkanten på mobil eller dekkes av header.
 */
const menuStyle = computed(() => {
  if (!props.point) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)'
    }
  }

  const padding = 16
  const menuWidth = 270
  const menuHeight = 180

  const vw = typeof window !== 'undefined' ? window.innerWidth : 400
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800

  let left = props.point.x - menuWidth / 2
  let top = props.point.y + 18 // Vis litt under trykkpunktet

  // Hold innenfor horisontale skjermkanter
  if (left < padding) left = padding
  if (left + menuWidth > vw - padding) left = vw - menuWidth - padding

  // Hvis menyen stikker ut av bunnen, vis den over punktet
  if (top + menuHeight > vh - padding) {
    top = props.point.y - menuHeight - 18
  }

  // Unngå header øverst (typisk ca 60px)
  if (top < padding + 54) {
    top = padding + 54
  }

  return {
    left: `${left}px`,
    top: `${top}px`
  }
})

function handleCreateTurpost() {
  if (!props.coords) return
  emit('create-turpost', props.coords)
}

function handleShowTurposterHere() {
  if (!props.coords) return
  emit('show-turposter-here', props.coords)
}

function handleKeyDown(e: KeyboardEvent) {
  if (props.isOpen && e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div v-if="isOpen && coords" class="context-menu-wrapper">
    <!-- Transparent backdrop som fanger klikk utenfor for å lukke -->
    <div
      class="context-menu-backdrop"
      @pointerdown.self="emit('close')"
      aria-hidden="true"
    ></div>

    <!-- Markør-pinne som peker ut nøyaktig valgt posisjon på kartet -->
    <div
      v-if="point"
      class="target-pin"
      :style="{ left: `${point.x}px`, top: `${point.y}px` }"
      aria-hidden="true"
    >
      <div class="target-pin-pulse"></div>
      <div class="target-pin-dot"></div>
    </div>

    <!-- Selve den flytende kontekstmenyen -->
    <div
      class="context-menu-card"
      :style="menuStyle"
      role="dialog"
      aria-label="Handlinger for valgt posisjon"
    >
      <div class="menu-header">
        <div class="menu-header-info">
          <span class="menu-title">Valgt punkt</span>
          <span class="menu-coords" :title="formattedCoords">{{ formattedCoords }}</span>
        </div>
        <button
          class="btn-close"
          @click="emit('close')"
          aria-label="Lukk meny"
          title="Lukk"
        >
          <X :size="16" />
        </button>
      </div>

      <div class="menu-actions">
        <!-- Valg 1: Opprett Turpost -->
        <button
          class="menu-btn btn-primary"
          @click="handleCreateTurpost"
          aria-label="Opprett turpost her"
        >
          <div class="btn-icon">
            <Mountain :size="18" />
          </div>
          <div class="btn-content">
            <span class="btn-title">Opprett Turpost</span>
            <span class="btn-subtitle">Legg til ny turpost på dette punktet</span>
          </div>
        </button>

        <!-- Valg 2: Vis turposter her -->
        <button
          class="menu-btn btn-secondary"
          @click="handleShowTurposterHere"
          aria-label="Vis turposter her"
        >
          <div class="btn-icon">
            <MapPin :size="18" />
          </div>
          <div class="btn-content">
            <span class="btn-title">Vis turposter her</span>
            <span class="btn-subtitle">Finn turposter i dette området</span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.context-menu-wrapper {
  position: absolute;
  inset: 0;
  z-index: 1100; /* Over kartlag og kontroller */
  pointer-events: none;
}

.context-menu-backdrop {
  position: absolute;
  inset: 0;
  pointer-events: auto;
  background: rgba(0, 0, 0, 0.15);
  animation: fadeIn 0.15s ease-out;
}

/* Markør på kartet */
.target-pin {
  position: absolute;
  width: 14px;
  height: 14px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 1101;
}

.target-pin-dot {
  position: absolute;
  inset: 2px;
  background: var(--primary, #0284c7);
  border: 2px solid #ffffff;
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}

.target-pin-pulse {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  background: rgba(2, 132, 199, 0.35);
  animation: targetPulse 1.8s ease-out infinite;
}

/* Selve flytende div / kort */
.context-menu-card {
  position: absolute;
  width: 270px;
  background: var(--bg-panel, rgba(15, 23, 42, 0.92));
  border: 1px solid var(--border-panel, rgba(255, 255, 255, 0.15));
  border-radius: 12px;
  padding: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  pointer-events: auto;
  animation: popIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  color: var(--text-main, #f8fafc);
  z-index: 1102;
}

.menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.menu-header-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow: hidden;
}

.menu-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted, #94a3b8);
}

.menu-coords {
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: var(--text-main, #f8fafc);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.btn-close:hover,
.btn-close:focus-visible {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  outline: none;
}

.menu-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.menu-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-main, #f8fafc);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease-out;
  min-height: 48px; /* God tap-target på mobil */
}

.menu-btn:hover,
.menu-btn:focus-visible {
  background: rgba(255, 255, 255, 0.1);
  outline: none;
  transform: translateY(-1px);
}

.menu-btn:active {
  transform: translateY(0);
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 7px;
  flex-shrink: 0;
}

.btn-primary .btn-icon {
  background: rgba(2, 132, 199, 0.25);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.btn-primary:hover {
  border-color: rgba(56, 189, 248, 0.4);
  background: rgba(2, 132, 199, 0.15);
}

.btn-secondary .btn-icon {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border: 1px solid rgba(52, 211, 153, 0.3);
}

.btn-secondary:hover {
  border-color: rgba(52, 211, 153, 0.4);
  background: rgba(16, 185, 129, 0.12);
}

.btn-content {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.btn-title {
  font-size: 13px;
  font-weight: 600;
  color: #f8fafc;
}

.btn-subtitle {
  font-size: 11px;
  color: var(--text-muted, #94a3b8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@keyframes popIn {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes targetPulse {
  0% {
    transform: scale(0.7);
    opacity: 0.9;
  }
  70% {
    transform: scale(2.2);
    opacity: 0;
  }
  100% {
    transform: scale(2.2);
    opacity: 0;
  }
}
</style>
