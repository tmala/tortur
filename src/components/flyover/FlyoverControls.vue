<script setup lang="ts">
import { computed } from 'vue'
import type { FlyoverCameraMode } from '@/composables/flyover/useFlyoverCamera'
import { FLYOVER_LAYERS } from '@/utils/flyoverTileSources'

const props = defineProps<{
  isPlaying: boolean
  progress: number
  elapsedSeconds: number
  remainingSeconds: number
  targetDurationSeconds: number
  speedMultiplier: number
  cameraMode: FlyoverCameraMode
  activeLayerId: string
  terrainExaggeration: number
  isRecordingVideo?: boolean
  canRecordVideo?: boolean
}>()

const emit = defineEmits<{
  (e: 'play'): void
  (e: 'pause'): void
  (e: 'toggle'): void
  (e: 'restart'): void
  (e: 'seek', progress: number): void
  (e: 'set-duration', seconds: number): void
  (e: 'set-speed', speed: number): void
  (e: 'set-camera-mode', mode: FlyoverCameraMode): void
  (e: 'change-layer', layerId: string): void
  (e: 'change-terrain-exaggeration', value: number): void
  (e: 'toggle-video-record'): void
}>()

const formatTime = (sec: number): string => {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const durationOptions = [
  { label: '30s', value: 30 },
  { label: '1 min', value: 60 },
  { label: '2 min', value: 120 },
  { label: '5 min', value: 300 }
]

const speedOptions = [
  { label: '0.5x', value: 0.5 },
  { label: '1x', value: 1.0 },
  { label: '1.5x', value: 1.5 },
  { label: '2x', value: 2.0 }
]

const cameraModes: { id: FlyoverCameraMode; label: string; icon: string }[] = [
  { id: 'follow', label: 'Følg sporet', icon: '🎬' },
  { id: 'orbit', label: 'Orbit', icon: '🔄' },
  { id: 'birdsEye', label: 'Oversikt', icon: '🦅' }
]

const currentProgressPercent = computed(() => {
  return `${(props.progress * 100).toFixed(1)}%`
})

const handleSliderChange = (e: Event) => {
  const input = e.target as HTMLInputElement
  emit('seek', parseFloat(input.value))
}
</script>

<template>
  <nav class="flyover-controls-panel" aria-label="3D avspillingskontroller">
    <!-- Tidslinje / Scrubber -->
    <div class="timeline-row">
      <span class="time-label">{{ formatTime(elapsedSeconds) }}</span>
      <div class="slider-wrapper">
        <input
          type="range"
          min="0"
          max="1"
          step="0.001"
          :value="progress"
          class="timeline-slider"
          aria-label="Fremdrift"
          @input="handleSliderChange"
        />
        <div class="slider-fill" :style="{ width: currentProgressPercent }"></div>
      </div>
      <span class="time-label text-right">-{{ formatTime(remainingSeconds) }}</span>
    </div>

    <!-- Hovedkontroll-knapper og valg -->
    <div class="buttons-row">
      <!-- Venstre: Kameramoduser -->
      <div class="controls-group">
        <div class="button-toggle-group" role="group" aria-label="Kameramodus">
          <button
            v-for="mode in cameraModes"
            :key="mode.id"
            type="button"
            class="toggle-btn"
            :class="{ active: cameraMode === mode.id }"
            :title="mode.label"
            :aria-label="mode.label"
            @click="emit('set-camera-mode', mode.id)"
          >
            <span>{{ mode.icon }}</span>
            <span class="btn-text">{{ mode.label }}</span>
          </button>
        </div>
      </div>

      <!-- Midt: Play / Pause / Restart -->
      <div class="controls-group-center">
        <button
          type="button"
          class="ctrl-btn ctrl-btn-sub"
          title="Start forfra"
          aria-label="Start forfra"
          @click="emit('restart')"
        >
          ⏮
        </button>

        <button
          type="button"
          class="ctrl-btn ctrl-btn-play"
          :title="isPlaying ? 'Pause (Mellomrom)' : 'Spill av (Mellomrom)'"
          :aria-label="isPlaying ? 'Pause' : 'Spill av'"
          @click="emit('toggle')"
        >
          <span v-if="isPlaying">⏸</span>
          <span v-else>▶</span>
        </button>
      </div>

      <!-- Høyre: Filmlengde, kartlag og videoopptak -->
      <div class="controls-group controls-group-right">
        <!-- Filmlengde -->
        <div class="dropdown-wrapper">
          <select
            class="custom-select"
            :value="targetDurationSeconds"
            aria-label="Velg filmlengde"
            title="Total filmlengde for sporet"
            @change="emit('set-duration', parseInt(($event.target as HTMLSelectElement).value, 10))"
          >
            <option v-for="d in durationOptions" :key="d.value" :value="d.value">
              ⏱ {{ d.label }}
            </option>
          </select>
        </div>

        <!-- Hastighet -->
        <div class="dropdown-wrapper">
          <select
            class="custom-select"
            :value="speedMultiplier"
            aria-label="Avspillingshastighet"
            title="Avspillingshastighet"
            @change="emit('set-speed', parseFloat(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="s in speedOptions" :key="s.value" :value="s.value">
              {{ s.label }}
            </option>
          </select>
        </div>

        <!-- Kartlag -->
        <div class="dropdown-wrapper">
          <select
            class="custom-select"
            :value="activeLayerId"
            aria-label="Velg kartlag"
            title="Kartlag for 3D-visning"
            @change="emit('change-layer', ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="layer in FLYOVER_LAYERS" :key="layer.id" :value="layer.id">
              🗺 {{ layer.name }}
            </option>
          </select>
        </div>

        <!-- Valgfritt videoopptak -->
        <button
          v-if="canRecordVideo"
          type="button"
          class="btn-record"
          :class="{ recording: isRecordingVideo }"
          :title="isRecordingVideo ? 'Stopp opptak og last ned video' : 'Ta opp film av turen'"
          :aria-label="isRecordingVideo ? 'Stopp opptak' : 'Ta opp film'"
          @click="emit('toggle-video-record')"
        >
          <span class="record-dot"></span>
          <span class="btn-text">{{ isRecordingVideo ? 'Avslutt' : 'Opptak' }}</span>
        </button>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.flyover-controls-panel {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 32px);
  max-width: 900px;
  background: rgba(15, 23, 42, 0.88);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  padding: 10px 16px 12px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  user-select: none;
}

.timeline-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.time-label {
  font-family: ui-monospace, monospace;
  font-size: 0.78rem;
  color: #cbd5e1;
  min-width: 38px;
}

.text-right {
  text-align: right;
}

.slider-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  height: 20px;
}

.timeline-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  outline: none;
  cursor: pointer;
  position: relative;
  z-index: 2;
  margin: 0;
}

.timeline-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  border: 2px solid #ea580c;
  cursor: pointer;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.6);
  transition: transform 0.1s ease;
}

.timeline-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.timeline-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  border: 2px solid #ea580c;
  cursor: pointer;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.6);
}

.slider-fill {
  position: absolute;
  left: 0;
  height: 6px;
  background: #ea580c;
  border-radius: 4px;
  pointer-events: none;
  z-index: 1;
}

.buttons-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.controls-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.controls-group-center {
  display: flex;
  align-items: center;
  gap: 12px;
}

.controls-group-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ctrl-btn {
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #f1f5f9;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.ctrl-btn-sub {
  width: 36px;
  height: 36px;
  font-size: 0.95rem;
}

.ctrl-btn-sub:hover {
  background: rgba(51, 65, 85, 0.95);
  color: #ffffff;
}

.ctrl-btn-play {
  width: 46px;
  height: 46px;
  background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
  border: none;
  color: #ffffff;
  font-size: 1.25rem;
  box-shadow: 0 4px 14px rgba(234, 88, 12, 0.45);
}

.ctrl-btn-play:hover {
  transform: scale(1.06);
  background: linear-gradient(135deg, #fb923c 0%, #ea580c 100%);
  box-shadow: 0 6px 18px rgba(234, 88, 12, 0.6);
}

.button-toggle-group {
  display: inline-flex;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
}

.toggle-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 0.8rem;
  padding: 5px 9px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.toggle-btn:hover {
  color: #f1f5f9;
}

.toggle-btn.active {
  background: rgba(249, 115, 22, 0.25);
  color: #fb923c;
  font-weight: 600;
}

.custom-select {
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #f1f5f9;
  font-size: 0.8rem;
  padding: 6px 10px;
  border-radius: 8px;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.custom-select:hover,
.custom-select:focus {
  border-color: #f97316;
}

.btn-record {
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #f1f5f9;
  font-size: 0.8rem;
  padding: 6px 10px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.record-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
}

.btn-record.recording {
  background: rgba(239, 68, 68, 0.2);
  border-color: #ef4444;
  color: #fca5a5;
}

.btn-record.recording .record-dot {
  animation: pulse 1s infinite alternate;
}

@media (max-width: 640px) {
  .flyover-controls-panel {
    bottom: 8px;
    width: calc(100% - 16px);
    padding: 8px 12px;
  }

  .btn-text {
    display: none;
  }

  .buttons-row {
    justify-content: center;
    gap: 8px;
  }
}
</style>
