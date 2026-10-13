<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, useTemplateRef, nextTick } from 'vue'
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
  Clock,
  ChevronDown,
  Film
} from 'lucide-vue-next'
import type { SavedTrack } from '@/stores/gpsTrack'
import { formatDistance } from '@/composables/useGeolocation'
import {
  formatPlaybackTime,
  formatClockTime,
  hasTrackTimestamps,
  interpolatePositionAtElapsedMs,
  getTrackDurationMs
} from '@/utils/trackPlayback'

const props = withDefaults(
  defineProps<{
    track: SavedTrack
    isReplaying: boolean
    replaySpeed: number
    replayProgress?: number
    replayElapsedMs?: number
    replayDurationMs?: number
    showKmMarkers: boolean
    showPhotosOnMap: boolean
    onTrackPhotosCount: number
    photosAvailable?: boolean
  }>(),
  {
    replayProgress: 0,
    replayElapsedMs: 0,
    replayDurationMs: 0,
    photosAvailable: true
  }
)

const emit = defineEmits<{
  (e: 'focus-track'): void
  (e: 'close'): void
  (e: 'update:showKmMarkers', val: boolean): void
  (e: 'update:showPhotosOnMap', val: boolean): void
  (e: 'play'): void
  (e: 'pause'): void
  (e: 'toggle-replay'): void
  (e: 'seek', progress: number): void
  (e: 'increase-speed'): void
  (e: 'decrease-speed'): void
  (e: 'cycle-speed'): void
  (e: 'stop-replay'): void
  (e: 'play-3d'): void
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

// Tidslinje og spoling
const isScrubbing = ref(false)
const scrubbingProgress = ref(0)
let wasPlayingBeforeScrub = false

const effectiveDurationMs = computed(() => {
  if (props.replayDurationMs && props.replayDurationMs > 0) {
    return props.replayDurationMs
  }
  if (props.track.durationMs && props.track.durationMs > 0) {
    return props.track.durationMs
  }
  if (props.track.points && props.track.points.length >= 2) {
    return getTrackDurationMs(props.track.points)
  }
  return 0
})

const currentProgress = computed(() => {
  return isScrubbing.value ? scrubbingProgress.value : (props.replayProgress ?? 0)
})

const currentElapsedMs = computed(() => {
  if (isScrubbing.value) {
    return Math.round(scrubbingProgress.value * effectiveDurationMs.value)
  }
  return props.replayElapsedMs ?? 0
})

const elapsedFormatted = computed(() => {
  return formatPlaybackTime(currentElapsedMs.value)
})

const totalDurationFormatted = computed(() => {
  return formatPlaybackTime(effectiveDurationMs.value)
})

const currentClockTime = computed(() => {
  const points = props.track.points
  if (points && points.length >= 2 && hasTrackTimestamps(points)) {
    const pos = interpolatePositionAtElapsedMs(points, currentElapsedMs.value, effectiveDurationMs.value)
    if (pos?.timestamp) {
      return formatClockTime(pos.timestamp, true)
    }
  }

  const start = props.track.startTime || props.track.createdAt
  if (start && start > 0) {
    return formatClockTime(start + currentElapsedMs.value, true)
  }

  return null
})

function onSliderPointerDown() {
  isScrubbing.value = true
  scrubbingProgress.value = props.replayProgress ?? 0
  wasPlayingBeforeScrub = props.isReplaying
  if (wasPlayingBeforeScrub) {
    emit('pause')
  }
}

function onSliderInput(e: Event) {
  const target = e.target as HTMLInputElement
  const val = Number(target.value) / 1000
  isScrubbing.value = true
  scrubbingProgress.value = val
  emit('seek', val)
}

function onSliderChange(e: Event) {
  const target = e.target as HTMLInputElement
  const val = Number(target.value) / 1000
  isScrubbing.value = false
  emit('seek', val)
  if (wasPlayingBeforeScrub) {
    emit('play')
    wasPlayingBeforeScrub = false
  }
}

function onSliderPointerUp() {
  if (isScrubbing.value) {
    isScrubbing.value = false
    if (wasPlayingBeforeScrub) {
      emit('play')
      wasPlayingBeforeScrub = false
    }
  }
}

function onGlobalPointerUp() {
  if (isScrubbing.value) {
    isScrubbing.value = false
    if (wasPlayingBeforeScrub) {
      emit('play')
      wasPlayingBeforeScrub = false
    }
  }
}

onMounted(() => {
  window.addEventListener('pointerup', onGlobalPointerUp)
  window.addEventListener('pointercancel', onGlobalPointerUp)
})

// Dra- og flyttelogikk for panelet
const panelRef = useTemplateRef<HTMLDivElement>('panelRef')
const dragPosition = ref<{ x: number; y: number }>({ x: 0, y: 0 })
const isDragging = ref(false)
let dragStart = { x: 0, y: 0 }
let initialPosition = { x: 0, y: 0 }

// Bredde- og justeringslogikk for panelet
const DEFAULT_WIDTH = 380
const MIN_WIDTH = 300
const STORAGE_KEY_PANEL_WIDTH = 'tortur.trackPanel.width'

const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1024)
const canResize = computed(() => viewportWidth.value > 640)
const maxAllowedWidth = computed(() => Math.max(MIN_WIDTH, viewportWidth.value - 28))

function getInitialPanelWidth(): number | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_PANEL_WIDTH)
    if (saved !== null) {
      const parsed = parseInt(saved, 10)
      if (!isNaN(parsed) && parsed >= MIN_WIDTH) {
        const maxW = typeof window !== 'undefined' ? window.innerWidth - 28 : 1200
        return Math.max(MIN_WIDTH, Math.min(maxW, parsed))
      }
    }
  } catch {
    // ignoreres dersom utilgjengelig
  }
  return null
}

const panelWidth = ref<number | null>(getInitialPanelWidth())
const currentWidth = computed(() => panelWidth.value ?? DEFAULT_WIDTH)

const panelStyle = computed(() => {
  const styles: Record<string, string> = {}
  if (canResize.value && panelWidth.value !== null) {
    styles.width = `${panelWidth.value}px`
    styles.maxWidth = 'none'
  }
  if (dragPosition.value.x !== 0 || dragPosition.value.y !== 0) {
    styles.transform = `translate3d(${dragPosition.value.x}px, ${dragPosition.value.y}px, 0)`
  }
  return styles
})

// Innstillinger skjul/vis (kilometermarkører og turbilder)
const STORAGE_KEY_SETTINGS_COLLAPSED = 'tortur.trackPanel.settingsCollapsed'

function getInitialSettingsCollapsed(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SETTINGS_COLLAPSED)
    if (saved !== null) {
      return saved === 'true'
    }
  } catch {
    // ignoreres dersom utilgjengelig
  }
  // Standard: på smale skjermer (< 480px) starter den skjult for å spare plass, ellers synlig
  if (typeof window !== 'undefined' && window.innerWidth < 480) {
    return true
  }
  return false
}

const settingsCollapsed = ref(getInitialSettingsCollapsed())

function toggleSettings() {
  settingsCollapsed.value = !settingsCollapsed.value
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS_COLLAPSED, String(settingsCollapsed.value))
  } catch {
    // ignoreres
  }
  nextTick(() => {
    handleWindowResize()
  })
}

let hasDragged = false

function handleTitleClick(e: MouseEvent) {
  // Ignorer klikk som inngikk i et drag
  if (hasDragged) {
    return
  }
  // Ignorer hvis brukeren dobbeltklikker for å tilbakestille panelposisjon
  if (e.detail > 1) {
    return
  }
  toggleSettings()
}

function resetPosition() {
  dragPosition.value = { x: 0, y: 0 }
}

function startDrag(e: PointerEvent) {
  // Kun primær museknapp eller touch/stylus
  if (e.button !== 0 && e.pointerType === 'mouse') return

  const target = e.target as HTMLElement | null
  // Ikke start dra dersom interaktive elementer trykkes på (unntatt tittelknappen som tillater både klikk og drag)
  if (target?.closest('button:not(.track-title-btn), input, label, a, .switch-control, .resize-handle')) {
    return
  }

  e.stopPropagation()

  hasDragged = false
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

  if (Math.hypot(deltaX, deltaY) > 5) {
    hasDragged = true
  }

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
  setTimeout(() => {
    hasDragged = false
  }, 50)
}

// Logikk for breddejustering (resizing) fra kantene
function resetWidth() {
  panelWidth.value = null
  try {
    localStorage.removeItem(STORAGE_KEY_PANEL_WIDTH)
  } catch {
    // ignoreres
  }
  nextTick(() => {
    handleWindowResize()
  })
}

const isResizing = ref(false)
let resizeSide: 'left' | 'right' = 'left'
let resizeStartX = 0
let resizeStartWidth = DEFAULT_WIDTH
let resizeStartDragX = 0
let resizeFixedRight = 0
let resizeFixedLeft = 0

function startResize(side: 'left' | 'right', e: PointerEvent) {
  if (e.button !== 0 && e.pointerType === 'mouse') return
  e.stopPropagation()

  isResizing.value = true
  resizeSide = side
  resizeStartX = e.clientX
  resizeStartDragX = dragPosition.value.x

  const rect = panelRef.value ? panelRef.value.getBoundingClientRect() : null
  resizeStartWidth = rect && rect.width > 0 ? rect.width : (panelWidth.value ?? DEFAULT_WIDTH)

  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1024
  const actualRightFallback = winWidth - 14 + resizeStartDragX

  if (rect && rect.right > 0 && rect.width > 0) {
    resizeFixedRight = rect.right
    resizeFixedLeft = rect.left
  } else {
    resizeFixedRight = actualRightFallback
    resizeFixedLeft = actualRightFallback - resizeStartWidth
  }

  const target = e.currentTarget as HTMLElement | null
  if (target?.setPointerCapture) {
    try {
      target.setPointerCapture(e.pointerId)
    } catch {
      // ignoreres
    }
  }

  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', onResizeEnd)
  window.addEventListener('pointercancel', onResizeEnd)
}

function onResizeMove(e: PointerEvent) {
  if (!isResizing.value) return

  const dx = e.clientX - resizeStartX
  const padding = 8
  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1024
  const maxW = Math.max(MIN_WIDTH, winWidth - 28)

  if (resizeSide === 'left') {
    let targetWidth = resizeStartWidth - dx
    const maxAllowedByLeftEdge = resizeFixedRight - padding
    targetWidth = Math.min(targetWidth, maxAllowedByLeftEdge)
    targetWidth = Math.min(targetWidth, maxW)
    targetWidth = Math.max(MIN_WIDTH, targetWidth)

    panelWidth.value = Math.round(targetWidth)
  } else {
    let targetWidth = resizeStartWidth + dx
    const maxAllowedByRightEdge = winWidth - padding - resizeFixedLeft
    targetWidth = Math.min(targetWidth, maxAllowedByRightEdge)
    targetWidth = Math.min(targetWidth, maxW)
    targetWidth = Math.max(MIN_WIDTH, targetWidth)

    const actualWidth = Math.round(targetWidth)
    panelWidth.value = actualWidth

    const widthDiff = actualWidth - resizeStartWidth
    dragPosition.value = {
      x: resizeStartDragX + widthDiff,
      y: dragPosition.value.y
    }
  }
}

function onResizeEnd() {
  if (!isResizing.value) return
  isResizing.value = false
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeEnd)
  window.removeEventListener('pointercancel', onResizeEnd)

  try {
    if (panelWidth.value !== null) {
      localStorage.setItem(STORAGE_KEY_PANEL_WIDTH, String(panelWidth.value))
    }
  } catch {
    // ignoreres
  }
}

function handleResizeKeydown(side: 'left' | 'right', e: KeyboardEvent) {
  if (!canResize.value) return
  const step = e.shiftKey ? 48 : 16
  const current = currentWidth.value
  const maxW = maxAllowedWidth.value

  let targetWidth: number | null = null

  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    if (side === 'left') {
      targetWidth = current + step
    } else {
      targetWidth = current - step
    }
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    if (side === 'left') {
      targetWidth = current - step
    } else {
      targetWidth = current + step
    }
  } else if (e.key === 'Home') {
    e.preventDefault()
    targetWidth = MIN_WIDTH
  } else if (e.key === 'End') {
    e.preventDefault()
    targetWidth = maxW
  }

  if (targetWidth !== null) {
    const clamped = Math.max(MIN_WIDTH, Math.min(maxW, targetWidth))
    if (side === 'right') {
      const diff = clamped - current
      dragPosition.value = {
        x: dragPosition.value.x + diff,
        y: dragPosition.value.y
      }
    }
    panelWidth.value = clamped
    try {
      localStorage.setItem(STORAGE_KEY_PANEL_WIDTH, String(clamped))
    } catch {
      // ignoreres
    }
    nextTick(() => {
      handleWindowResize()
    })
  }
}

function handleWindowResize() {
  viewportWidth.value = window.innerWidth
  if (canResize.value && panelWidth.value !== null) {
    const maxW = Math.max(MIN_WIDTH, window.innerWidth - 28)
    if (panelWidth.value > maxW) {
      panelWidth.value = maxW
    }
  }

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

// Nullstill posisjonen og tidslinjen ved bytte av spor
watch(
  () => props.track?.id || props.track?.createdAt,
  () => {
    resetPosition()
    isScrubbing.value = false
    scrubbingProgress.value = 0
    wasPlayingBeforeScrub = false
  }
)

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeEnd)
  window.removeEventListener('pointercancel', onResizeEnd)
  window.removeEventListener('pointerup', onGlobalPointerUp)
  window.removeEventListener('pointercancel', onGlobalPointerUp)
})

defineExpose({
  resetPosition,
  resetWidth,
  dragPosition,
  panelWidth,
  canResize,
  isDragging,
  isResizing,
  settingsCollapsed,
  toggleSettings
})
</script>

<template>
  <div
    ref="panelRef"
    class="track-control-panel"
    :class="{
      'is-dragging': isDragging,
      'is-resizing': isResizing,
      'is-settings-collapsed': settingsCollapsed
    }"
    :style="panelStyle"
    role="region"
    aria-label="Sporvisningspanel"
  >
    <!-- Resize-håndtak på venstre og høyre kant (kun på skjermer > 640px) -->
    <div
      v-if="canResize"
      class="resize-handle resize-handle--left"
      role="separator"
      aria-orientation="vertical"
      aria-label="Juster bredde på sporvisningspanel (venstre kant)"
      tabindex="0"
      :aria-valuenow="currentWidth"
      :aria-valuemin="MIN_WIDTH"
      :aria-valuemax="maxAllowedWidth"
      title="Dra for å endre bredde (dobbeltklikk for standardbredde)"
      @pointerdown="startResize('left', $event)"
      @dblclick.stop.prevent="resetWidth"
      @keydown="handleResizeKeydown('left', $event)"
    >
      <span class="resize-pill"></span>
    </div>

    <div
      v-if="canResize"
      class="resize-handle resize-handle--right"
      role="separator"
      aria-orientation="vertical"
      aria-label="Juster bredde på sporvisningspanel (høyre kant)"
      tabindex="0"
      :aria-valuenow="currentWidth"
      :aria-valuemin="MIN_WIDTH"
      :aria-valuemax="maxAllowedWidth"
      title="Dra for å endre bredde (dobbeltklikk for standardbredde)"
      @pointerdown="startResize('right', $event)"
      @dblclick.stop.prevent="resetWidth"
      @keydown="handleResizeKeydown('right', $event)"
    >
      <span class="resize-pill"></span>
    </div>

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
          <button
            type="button"
            class="track-title-btn"
            :aria-expanded="!settingsCollapsed"
            aria-controls="track-panel-settings"
            :title="settingsCollapsed ? 'Vis sporinnstillinger (kilometermarkører og turbilder)' : 'Skjul sporinnstillinger'"
            @click="handleTitleClick"
            @keydown.enter.prevent="toggleSettings"
            @keydown.space.prevent="toggleSettings"
          >
            <ChevronDown
              :size="14"
              class="collapse-chevron"
              :class="{ 'is-collapsed': settingsCollapsed }"
              aria-hidden="true"
            />
            <Route :size="15" class="route-icon" />
            <span class="track-title" :title="track.name">{{ track.name }}</span>
            <span v-if="track.distanceMeters" class="track-distance">({{ distanceFormatted }})</span>
          </button>
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

    <!-- LINJE 2 & 3: Valg om kilometer-markører og turbilder på kartet -->
    <div
      id="track-panel-settings"
      class="panel-settings-collapse"
      v-show="!settingsCollapsed"
    >
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
      <div
        v-if="photosAvailable"
        class="panel-row row-toggle"
        :class="{ 'is-disabled': onTrackPhotosCount === 0 }"
      >
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
    </div>

    <!-- LINJE 4: Tidslinje og spoling -->
    <div class="panel-row row-timeline">
      <div class="timeline-meta">
        <div class="timeline-time-group">
          <!-- Klokkeslett på sporet hvis tilgjengelig -->
          <span v-if="currentClockTime" class="timeline-clock-badge" title="Tidspunkt på sporet">
            <Clock :size="11" class="clock-icon-mini" />
            <span class="timeline-clock-text">{{ currentClockTime }}</span>
          </span>
          <!-- Medgått tid -->
          <span class="timeline-elapsed" title="Medgått spilletid">
            {{ elapsedFormatted }}
          </span>
        </div>
        <!-- Total varighet -->
        <span class="timeline-duration" title="Total varighet">
          {{ totalDurationFormatted }}
        </span>
      </div>

      <div class="timeline-track-wrapper">
        <input
          type="range"
          min="0"
          max="1000"
          step="1"
          :value="Math.round(currentProgress * 1000)"
          @pointerdown="onSliderPointerDown"
          @pointerdown.stop
          @input="onSliderInput"
          @change="onSliderChange"
          @pointerup="onSliderPointerUp"
          class="timeline-slider"
          aria-label="Spol i sporet"
          :aria-valuetext="`${currentClockTime ? currentClockTime + ' (' + elapsedFormatted + ')' : elapsedFormatted} av ${totalDurationFormatted}`"
          :style="{
            '--progress-percent': `${(currentProgress * 100).toFixed(2)}%`
          }"
        />
      </div>
    </div>

    <!-- LINJE 5: Avspilling av sporet -->
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

        <!-- 3D filmavspilling -->
        <button
          type="button"
          class="btn-playback-control btn-playback-3d"
          @click="emit('play-3d')"
          title="Opplev sporet i 3D-terreng med flyover-kamera"
          aria-label="3D-film flyover"
        >
          <Film :size="12" />
          <span>3D-film</span>
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

.track-control-panel.is-resizing {
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(56, 189, 248, 0.6);
  user-select: none;
  -webkit-user-select: none;
  cursor: ew-resize;
}

/* Resize-håndtak på venstre og høyre kant */
.resize-handle {
  position: absolute;
  top: 8px;
  bottom: 8px;
  width: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ew-resize;
  touch-action: none;
  z-index: 10;
  user-select: none;
  -webkit-user-select: none;
}

.resize-handle--left {
  left: -7px;
}

.resize-handle--right {
  right: -7px;
}

.resize-pill {
  width: 3px;
  height: 28px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.16);
  transition: all 0.15s ease;
}

.resize-handle:hover .resize-pill,
.resize-handle:focus-visible .resize-pill {
  background: rgba(56, 189, 248, 0.85);
  height: 38px;
  width: 4px;
}

.resize-handle:focus-visible {
  outline: none;
}

.resize-handle:focus-visible .resize-pill {
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.4);
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

.track-title-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  padding: 1px 4px 1px 2px;
  margin: -1px 0;
  border-radius: 6px;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-width: 0;
  max-width: 100%;
  transition: background-color 0.15s ease, opacity 0.15s ease;
}

.track-title-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.track-title-btn:focus-visible {
  outline: 2px solid #38bdf8;
  outline-offset: 1px;
}

.collapse-chevron {
  color: #38bdf8;
  flex-shrink: 0;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.collapse-chevron.is-collapsed {
  transform: rotate(-90deg);
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

.panel-settings-collapse {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* LINJE 4: Tidslinje og spoling */
.row-timeline {
  flex-direction: column;
  gap: 4px;
  padding-top: 6px;
  border-top: 1px solid rgba(51, 65, 85, 0.5);
  align-items: stretch;
}

.track-control-panel.is-settings-collapsed .row-timeline {
  border-top: none;
  padding-top: 2px;
}

.timeline-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.timeline-time-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.timeline-clock-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 700;
  color: #38bdf8;
  background: rgba(2, 132, 199, 0.2);
  padding: 1px 6px;
  border-radius: 6px;
  border: 1px solid rgba(56, 189, 248, 0.35);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.2px;
}

.clock-icon-mini {
  color: #38bdf8;
  flex-shrink: 0;
}

.timeline-elapsed {
  font-size: 11.5px;
  font-weight: 600;
  color: #f1f5f9;
  font-variant-numeric: tabular-nums;
}

.timeline-duration {
  font-size: 11px;
  font-weight: 500;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}

.timeline-track-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 18px;
}

.timeline-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 9999px;
  outline: none;
  background: linear-gradient(
    to right,
    #38bdf8 0%,
    #34d399 var(--progress-percent),
    rgba(51, 65, 85, 0.7) var(--progress-percent),
    rgba(51, 65, 85, 0.7) 100%
  );
  cursor: pointer;
  touch-action: none;
  margin: 0;
  transition: height 0.15s ease;
}

.timeline-slider:hover {
  height: 8px;
}

/* Webkit (Chrome, Edge, Safari) */
.timeline-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ffffff;
  border: 2px solid #38bdf8;
  box-shadow: 0 0 6px rgba(56, 189, 248, 0.6);
  cursor: grab;
  transition: transform 0.12s ease, background-color 0.12s ease, border-color 0.12s ease;
}

.timeline-slider::-webkit-slider-thumb:hover {
  transform: scale(1.25);
  background: #38bdf8;
  border-color: #ffffff;
}

.timeline-slider::-webkit-slider-thumb:active {
  cursor: grabbing;
  transform: scale(1.35);
  background: #34d399;
  border-color: #ffffff;
}

/* Firefox */
.timeline-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ffffff;
  border: 2px solid #38bdf8;
  box-shadow: 0 0 6px rgba(56, 189, 248, 0.6);
  cursor: grab;
  transition: transform 0.12s ease, background-color 0.12s ease, border-color 0.12s ease;
}

.timeline-slider::-moz-range-thumb:hover {
  transform: scale(1.25);
  background: #38bdf8;
  border-color: #ffffff;
}

.timeline-slider::-moz-range-thumb:active {
  cursor: grabbing;
  transform: scale(1.35);
  background: #34d399;
  border-color: #ffffff;
}

.timeline-slider::-moz-range-track {
  background: transparent;
  border: none;
}

/* LINJE 5: Avspilling */
.row-playback {
  padding-top: 5px;
  border-top: 1px solid rgba(51, 65, 85, 0.4);
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

/* 3D-film knapp */
.btn-playback-3d {
  background: rgba(249, 115, 22, 0.2);
  border: 1px solid rgba(249, 115, 22, 0.55);
  color: #fb923c;
  font-weight: 700;
  box-shadow: 0 0 10px rgba(249, 115, 22, 0.15);
}

.btn-playback-3d:hover {
  background: rgba(249, 115, 22, 0.38);
  color: #ffffff;
  border-color: rgba(249, 115, 22, 0.85);
  box-shadow: 0 0 14px rgba(249, 115, 22, 0.35);
  transform: scale(1.02);
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
