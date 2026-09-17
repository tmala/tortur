<script setup lang="ts">
import { ref, computed, watch, onUnmounted, useTemplateRef } from 'vue'
import {
  Route,
  Navigation,
  X,
  MapPin,
  Camera,
  Play,
  Pause,
  Square,
  Minus,
  Plus,
  Clock
} from 'lucide-vue-next'
import type { SavedTrack } from '@/stores/gpsTrack'
import { formatDistance } from '@/composables/useGeolocation'

const props = defineProps<{
  track: SavedTrack
  isReplaying: boolean
  replaySpeed: number
  showKmMarkers: boolean
  showPhotosOnMap: boolean
  onTrackPhotosCount: number
}>()

const emit = defineEmits<{
  (e: 'focus-track'): void
  (e: 'close'): void
  (e: 'update:showKmMarkers', val: boolean): void
  (e: 'update:showPhotosOnMap', val: boolean): void
  (e: 'play'): void
  (e: 'pause'): void
  (e: 'toggle-replay'): void
  (e: 'increase-speed'): void
  (e: 'decrease-speed'): void
  (e: 'cycle-speed'): void
  (e: 'stop-replay'): void
}>()

const SPEED_OPTIONS = [10, 20, 40, 80, 120, 160]
const canDecreaseSpeed = computed(() => props.replaySpeed > SPEED_OPTIONS[0]!)
const canIncreaseSpeed = computed(() => props.replaySpeed < SPEED_OPTIONS[SPEED_OPTIONS.length - 1]!)

const distanceFormatted = computed(() => {
  return formatDistance(props.track.distanceMeters)
})

const timeFormatted = computed(() => {
  const start = props.track.startTime || props.track.createdAt
  if (!start) return ''
  const d = new Date(start)
  const dateStr = d.toLocaleDateString('no-NO', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const startStr = d.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })

  let endStr = ''
  if (props.track.endTime) {
    endStr = new Date(props.track.endTime).toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })
  } else if (props.track.durationMs && props.track.durationMs > 0) {
    endStr = new Date(start + props.track.durationMs).toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })
  }

  if (endStr) {
    return `${dateStr} • ${startStr}–${endStr}`
  }
  return `${dateStr} • Start: ${startStr}`
})

// Dra- og flyttelogikk for panelet
const panelRef = useTemplateRef<HTMLDivElement>('panelRef')
const dragPosition = ref<{ x: number; y: number }>({ x: 0, y: 0 })
const isDragging = ref(false)
let dragStart = { x: 0, y: 0 }
let initialPosition = { x: 0, y: 0 }

const panelStyle = computed(() => {
  if (dragPosition.value.x === 0 && dragPosition.value.y === 0) {
    return {}
  }
  return {
    transform: `translate3d(${dragPosition.value.x}px, ${dragPosition.value.y}px, 0)`
  }
})

function resetPosition() {
  dragPosition.value = { x: 0, y: 0 }
}

function startDrag(e: PointerEvent) {
  // Kun primær museknapp eller touch/stylus
  if (e.button !== 0 && e.pointerType === 'mouse') return

  const target = e.target as HTMLElement | null
  // Ikke start dra dersom interaktive elementer trykkes på
  if (target?.closest('button, input, label, a, .switch-control')) {
    return
  }

  e.stopPropagation()

  isDragging.value = true
  dragStart = { x: e.clientX, y: e.clientY }
  initialPosition = { ...dragPosition.value }

  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

function onDragMove(e: PointerEvent) {
  if (!isDragging.value) return

  const deltaX = e.clientX - dragStart.x
  const deltaY = e.clientY - dragStart.y

  let newX = initialPosition.x + deltaX
  let newY = initialPosition.y + deltaY

  if (panelRef.value) {
    const rect = panelRef.value.getBoundingClientRect()
    // Beregn panelets opprinnelige layoutposisjon før gjeldende transform
    const baseLeft = rect.left - dragPosition.value.x
    const baseTop = rect.top - dragPosition.value.y

    const padding = 8
    const minX = -baseLeft + padding
    const maxX = window.innerWidth - (baseLeft + rect.width) - padding
    const minY = -baseTop + padding
    const maxY = window.innerHeight - (baseTop + rect.height) - padding

    if (minX <= maxX) {
      newX = Math.max(minX, Math.min(maxX, newX))
    }
    if (minY <= maxY) {
      newY = Math.max(minY, Math.min(maxY, newY))
    }
  }

  dragPosition.value = { x: newX, y: newY }
}

function onDragEnd() {
  if (!isDragging.value) return
  isDragging.value = false
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
}

function handleWindowResize() {
  if (dragPosition.value.x === 0 && dragPosition.value.y === 0) return
  if (!panelRef.value) return

  const rect = panelRef.value.getBoundingClientRect()
  const baseLeft = rect.left - dragPosition.value.x
  const baseTop = rect.top - dragPosition.value.y

  const padding = 8
  const minX = -baseLeft + padding
  const maxX = window.innerWidth - (baseLeft + rect.width) - padding
  const minY = -baseTop + padding
  const maxY = window.innerHeight - (baseTop + rect.height) - padding

  let newX = dragPosition.value.x
  let newY = dragPosition.value.y

  if (minX <= maxX) {
    newX = Math.max(minX, Math.min(maxX, newX))
  }
  if (minY <= maxY) {
    newY = Math.max(minY, Math.min(maxY, newY))
  }

  dragPosition.value = { x: newX, y: newY }
}

window.addEventListener('resize', handleWindowResize)

// Nullstill posisjonen ved bytte av spor
watch(
  () => props.track?.id || props.track?.createdAt,
  () => {
    resetPosition()
  }
)

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
})

defineExpose({
  resetPosition,
  dragPosition,
  isDragging
})
</script>

<template>
  <div
    ref="panelRef"
    class="track-control-panel"
    :class="{ 'is-dragging': isDragging }"
    :style="panelStyle"
    role="region"
    aria-label="Sporvisningspanel"
  >
    <!-- Håndtak for å dra panelet rundt på skjermen -->
    <div
      class="panel-drag-bar"
      @pointerdown="startDrag"
      @dblclick="resetPosition"
      title="Klikk og dra for å flytte panelet (dobbeltklikk for standardplassering)"
      aria-label="Dra for å flytte panelet"
    >
      <span class="drag-pill"></span>
    </div>

    <!-- LINJE 1: Sporets navn, start-stopp tidspunkt og knappen "Sentrér" (samt lukkeknapp) -->
    <div
      class="panel-row row-header"
      @pointerdown="startDrag"
      @dblclick="resetPosition"
      title="Klikk og dra for å flytte panelet (dobbeltklikk for standardplassering)"
    >
      <div class="track-info-col">
        <div class="track-title-row">
          <Route :size="15" class="route-icon" />
          <span class="track-title" :title="track.name">{{ track.name }}</span>
          <span v-if="track.distanceMeters" class="track-distance">({{ distanceFormatted }})</span>
        </div>
        <div v-if="timeFormatted" class="track-time-row">
          <Clock :size="12" class="clock-icon" />
          <span>{{ timeFormatted }}</span>
        </div>
      </div>

      <div class="track-header-actions">
        <button
          type="button"
          class="btn-track-action btn-focus"
          @click="emit('focus-track')"
          title="Sentrér og zoom til sporet"
          aria-label="Sentrér på sporet"
        >
          <Navigation :size="12" />
          <span>Sentrér</span>
        </button>
        <button
          type="button"
          class="btn-track-action btn-close"
          @click="emit('close')"
          title="Skjul sporet fra kartet"
          aria-label="Lukk sporpanel"
        >
          <X :size="14" />
        </button>
      </div>
    </div>

    <!-- LINJE 2: Valg om kilometer-markører skal vises eller ikke -->
    <div class="panel-row row-toggle">
      <div class="toggle-info">
        <MapPin :size="14" class="toggle-icon text-amber" />
        <span class="toggle-text">Kilometer-markører</span>
      </div>
      <label class="switch-control">
        <input
          type="checkbox"
          :checked="showKmMarkers"
          @change="emit('update:showKmMarkers', ($event.target as HTMLInputElement).checked)"
          aria-label="Vis kilometermarkører"
        />
        <span class="slider round"></span>
      </label>
    </div>

    <!-- LINJE 3: Valg om bilder tilknyttet turen skal vises på kartet som små thumbnails -->
    <div class="panel-row row-toggle" :class="{ 'is-disabled': onTrackPhotosCount === 0 }">
      <div class="toggle-info">
        <Camera :size="14" class="toggle-icon text-sky" />
        <div class="toggle-text-block">
          <span class="toggle-text">Turbilder på kartet</span>
          <span v-if="onTrackPhotosCount > 0" class="toggle-subtext">
            {{ onTrackPhotosCount }} {{ onTrackPhotosCount === 1 ? 'bilde' : 'bilder' }} på sporet
          </span>
          <span v-else class="toggle-subtext text-muted">
            (Ingen bilder på sporet)
          </span>
        </div>
      </div>
      <label class="switch-control" :class="{ 'switch-disabled': onTrackPhotosCount === 0 }">
        <input
          type="checkbox"
          :checked="showPhotosOnMap && onTrackPhotosCount > 0"
          :disabled="onTrackPhotosCount === 0"
          @change="emit('update:showPhotosOnMap', ($event.target as HTMLInputElement).checked)"
          aria-label="Vis turbilder på kartet"
        />
        <span class="slider round"></span>
      </label>
    </div>

    <!-- LINJE 4: Avspilling av sporet -->
    <div class="panel-row row-playback">
      <div class="playback-buttons">
        <!-- Spill av knapp -->
        <button
          type="button"
          class="btn-playback-control btn-playback-play"
          :class="{ 'is-active': isReplaying }"
          :disabled="isReplaying"
          @click="emit('play')"
          title="Spill av ruten med animert markør"
          aria-label="Spill av rute"
        >
          <Play :size="12" fill="currentColor" />
          <span>Spill av</span>
        </button>

        <!-- Pause knapp -->
        <button
          type="button"
          class="btn-playback-control btn-playback-pause"
          :class="{ 'is-active': !isReplaying }"
          :disabled="!isReplaying"
          @click="emit('pause')"
          title="Pause avspillingen"
          aria-label="Pause avspilling"
        >
          <Pause :size="12" fill="currentColor" />
          <span>Pause</span>
        </button>

        <!-- Stopp og nullstill knapp med firkantikon (⏹ stopp, ikke refresh) -->
        <button
          type="button"
          class="btn-playback-stop"
          @click="emit('stop-replay')"
          title="Stopp og nullstill avspilling til start"
          aria-label="Stopp og nullstill"
        >
          <Square :size="10" fill="currentColor" />
        </button>

        <!-- Hastighetsindikator med minus foran og pluss bak -->
        <div class="speed-stepper-control" role="group" aria-label="Juster avspillingsfart">
          <button
            type="button"
            class="btn-speed-step btn-speed-minus"
            :disabled="!canDecreaseSpeed"
            @click="emit('decrease-speed')"
            title="Reduser hastighet"
            aria-label="Reduser hastighet"
          >
            <Minus :size="11" />
          </button>

          <span
            class="speed-value"
            @click="emit('cycle-speed')"
            :title="`Nåværende fart: ${replaySpeed}x (klikk for å bla)`"
          >
            {{ replaySpeed }}x
          </span>

          <button
            type="button"
            class="btn-speed-step btn-speed-plus"
            :disabled="!canIncreaseSpeed"
            @click="emit('increase-speed')"
            title="Øk hastighet"
            aria-label="Øk hastighet"
          >
            <Plus :size="11" />
          </button>
        </div>
      </div>

      <span v-if="isReplaying" class="replay-status-indicator">
        <span class="pulse-dot"></span>
        Spiller av...
      </span>
    </div>
  </div>
</template>

<style scoped>
.track-control-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.06);
  color: #f8fafc;
  padding: 8px 12px 10px 12px;
  width: 100%;
  max-width: 380px;
  box-sizing: border-box;
  font-family: inherit;
  gap: 8px;
  pointer-events: auto;
  transition: box-shadow 0.2s ease;
}

.track-control-panel.is-dragging {
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(56, 189, 248, 0.6);
  user-select: none;
  -webkit-user-select: none;
}

/* Håndtak for å dra panelet */
.panel-drag-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1px 0 4px 0;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.drag-pill {
  width: 38px;
  height: 4px;
  background: rgba(255, 255, 255, 0.22);
  border-radius: 9999px;
  transition: all 0.15s ease;
}

.panel-drag-bar:hover .drag-pill {
  background: rgba(56, 189, 248, 0.65);
  width: 48px;
}

.panel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
}

/* LINJE 1: Header */
.row-header {
  align-items: flex-start;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(51, 65, 85, 0.5);
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.row-header:active,
.panel-drag-bar:active,
.track-control-panel.is-dragging,
.track-control-panel.is-dragging .row-header,
.track-control-panel.is-dragging .panel-drag-bar {
  cursor: grabbing;
}

.track-info-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.track-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.route-icon {
  color: #34d399;
  flex-shrink: 0;
}

.track-title {
  font-size: 13.5px;
  font-weight: 700;
  color: #f1f5f9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-distance {
  color: #34d399;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.track-time-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.clock-icon {
  color: #64748b;
  flex-shrink: 0;
}

.track-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.btn-track-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  border-radius: 8px;
}

.btn-focus {
  gap: 4px;
  background: rgba(16, 185, 129, 0.18);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #6ee7b7;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
}

.btn-focus:hover {
  background: rgba(16, 185, 129, 0.35);
  color: #ffffff;
}

.btn-close {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #94a3b8;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 50%;
}

.btn-close:hover {
  background: rgba(239, 68, 68, 0.3);
  color: #ffffff;
  border-color: rgba(239, 68, 68, 0.5);
}

/* LINJE 2 & 3: Toggles */
.row-toggle {
  padding: 3px 0;
  align-items: center;
}

.row-toggle.is-disabled {
  opacity: 0.55;
}

.toggle-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.toggle-icon {
  flex-shrink: 0;
}

.text-amber {
  color: #f59e0b;
}

.text-sky {
  color: #38bdf8;
}

.toggle-text-block {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.toggle-text {
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
}

.toggle-subtext {
  font-size: 10.5px;
  color: #38bdf8;
  font-weight: 500;
}

.toggle-subtext.text-muted {
  color: #64748b;
}

/* Bryter / Switch Control */
.switch-control {
  position: relative;
  display: inline-block;
  width: 34px;
  height: 20px;
  flex-shrink: 0;
  cursor: pointer;
}

.switch-control.switch-disabled {
  cursor: not-allowed;
}

.switch-control input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background-color: #334155;
  transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.slider:before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 3px;
  bottom: 3px;
  background-color: #cbd5e1;
  transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

input:checked + .slider {
  background-color: #0284c7;
}

input:checked + .slider:before {
  transform: translateX(14px);
  background-color: #ffffff;
}

.slider.round {
  border-radius: 20px;
}

.slider.round:before {
  border-radius: 50%;
}

/* LINJE 4: Avspilling */
.row-playback {
  padding-top: 6px;
  border-top: 1px solid rgba(51, 65, 85, 0.5);
  align-items: center;
  justify-content: space-between;
}

.playback-buttons {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.btn-playback-control {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 12px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

/* Spill av knapp */
.btn-playback-play {
  background: rgba(16, 185, 129, 0.18);
  border: 1px solid rgba(52, 211, 153, 0.45);
  color: #34d399;
}

.btn-playback-play:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.35);
  color: #ffffff;
  border-color: rgba(52, 211, 153, 0.7);
}

.btn-playback-play:disabled {
  opacity: 0.45;
  cursor: default;
  border-color: rgba(52, 211, 153, 0.2);
}

/* Pause knapp */
.btn-playback-pause {
  background: rgba(245, 158, 11, 0.2);
  border: 1px solid rgba(251, 191, 36, 0.45);
  color: #fbbf24;
}

.btn-playback-pause:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.38);
  color: #ffffff;
  border-color: rgba(251, 191, 36, 0.7);
}

.btn-playback-pause:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.1);
  color: #94a3b8;
}

/* Stopp knapp med firkantikon */
.btn-playback-stop {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(248, 113, 113, 0.35);
  color: #f87171;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-playback-stop:hover {
  background: rgba(239, 68, 68, 0.35);
  border-color: rgba(248, 113, 113, 0.65);
  color: #ffffff;
}

/* Hastighetsvelger med minus, verdi og pluss */
.speed-stepper-control {
  display: inline-flex;
  align-items: center;
  background: rgba(2, 132, 199, 0.16);
  border: 1px solid rgba(56, 189, 248, 0.4);
  border-radius: 12px;
  padding: 1px 2px;
}

.btn-speed-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: transparent;
  border: none;
  color: #38bdf8;
  cursor: pointer;
  padding: 0;
  transition: all 0.12s ease;
}

.btn-speed-step:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.25);
  color: #ffffff;
}

.btn-speed-step:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.speed-value {
  font-size: 11px;
  font-weight: 700;
  color: #38bdf8;
  min-width: 32px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  user-select: none;
  cursor: pointer;
  padding: 0 2px;
}

.speed-value:hover {
  color: #ffffff;
}

.replay-status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #fb923c;
  font-weight: 500;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #fb923c;
  animation: dot-pulse 1.2s infinite ease-in-out;
}

@keyframes dot-pulse {
  0%, 100% {
    opacity: 0.4;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1.3);
  }
}
</style>
