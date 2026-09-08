<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  Route,
  X,
  Download,
  Trash2,
  Clock,
  MapPin,
  Check,
  Play,
  Square,
  AlertTriangle,
  BookmarkPlus,
  FolderHeart
} from 'lucide-vue-next'
import {
  type TrackPoint,
  calculateDistanceMeters,
  formatDistance
} from '@/composables/useGeolocation'
import { useGpsTrackStore } from '@/stores/gpsTrack'

const props = defineProps<{
  isOpen: boolean
  trackPoints: TrackPoint[]
  isTracking: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'clear-track'): void
  (e: 'toggle-tracking'): void
  (e: 'open-saved-tracks'): void
}>()

const trackStore = useGpsTrackStore()
const showConfirmDelete = ref(false)
const hasDownloaded = ref(false)
const showSaveForm = ref(false)
const saveTrackName = ref('')
const hasSaved = ref(false)

// Beregn total distanse
const totalDistanceMeters = computed(() => {
  const pts = props.trackPoints
  if (pts.length < 2) return 0
  let dist = 0
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]
    const curr = pts[i]
    if (prev && curr) {
      dist += calculateDistanceMeters(prev.lat, prev.lng, curr.lat, curr.lng)
    }
  }
  return dist
})

// Tidsberegning
const startTime = computed(() => {
  if (props.trackPoints.length === 0) return null
  const first = props.trackPoints[0]
  return first && first.timestamp ? new Date(first.timestamp) : null
})

const endTime = computed(() => {
  if (props.trackPoints.length === 0) return null
  const last = props.trackPoints[props.trackPoints.length - 1]
  return last && last.timestamp ? new Date(last.timestamp) : null
})

const durationText = computed(() => {
  if (!startTime.value || !endTime.value) return '–'
  const diffMs = endTime.value.getTime() - startTime.value.getTime()
  if (diffMs <= 0) return '< 1 min'
  const totalMin = Math.round(diffMs / 60000)
  if (totalMin < 60) return `${totalMin} min`
  const hours = Math.floor(totalMin / 60)
  const remMin = totalMin % 60
  return remMin > 0 ? `${hours} t ${remMin} min` : `${hours} t`
})

const formatDate = (d: Date | null) => {
  if (!d) return ''
  return d.toLocaleDateString('no-NO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Last ned som standard GPX 1.1 XML-fil
const handleDownloadGpx = () => {
  if (props.trackPoints.length === 0) return

  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10)
  const timeStr = now.toTimeString().slice(0, 5).replace(':', '')
  const fileName = `tortur-spor-${dateStr}-${timeStr}.gpx`

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`
  gpx += `<gpx version="1.1" creator="TorTur - https://tortur.app" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">\n`
  gpx += `  <metadata>\n`
  gpx += `    <name>TorTur Sporlogg ${dateStr}</name>\n`
  gpx += `    <time>${now.toISOString()}</time>\n`
  gpx += `  </metadata>\n`
  gpx += `  <trk>\n`
  gpx += `    <name>TorTur Tur ${dateStr}</name>\n`
  gpx += `    <trkseg>\n`

  for (const pt of props.trackPoints) {
    const timeXml = pt.timestamp ? `\n        <time>${new Date(pt.timestamp).toISOString()}</time>` : ''
    gpx += `      <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lng.toFixed(6)}">${timeXml}\n      </trkpt>\n`
  }

  gpx += `    </trkseg>\n`
  gpx += `  </trk>\n`
  gpx += `</gpx>`

  const blob = new Blob([gpx], { type: 'application/gpx+xml;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  hasDownloaded.value = true
  setTimeout(() => {
    hasDownloaded.value = false
  }, 4000)
}

const handleDeleteTrack = () => {
  emit('clear-track')
  showConfirmDelete.value = false
  emit('close')
}

// Lagre til Pinia Store / Mine spor
const handleStartSave = () => {
  showSaveForm.value = true
  const now = new Date()
  const dateStr = now.toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })
  const timeStr = now.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })
  saveTrackName.value = `Tur ${dateStr}, kl. ${timeStr}`
}

const handleConfirmSave = () => {
  if (props.trackPoints.length === 0) return
  const saved = trackStore.saveTrack(props.trackPoints, saveTrackName.value)
  showSaveForm.value = false
  if (saved) {
    hasSaved.value = true
    setTimeout(() => {
      hasSaved.value = false
    }, 4000)
  }
}

const handleOpenSavedTracks = () => {
  emit('open-saved-tracks')
  emit('close')
}

// Dra/flytte-funksjonalitet
const modalRef = ref<HTMLElement | null>(null)
const dragPosition = ref({ x: 0, y: 0 })
const isDragging = ref(false)
let dragStart = { x: 0, y: 0 }
let initialPosition = { x: 0, y: 0 }

const modalStyle = computed(() => {
  if (dragPosition.value.x === 0 && dragPosition.value.y === 0) {
    return {}
  }
  return {
    transform: `translate3d(${dragPosition.value.x}px, ${dragPosition.value.y}px, 0)`
  }
})

const startDrag = (e: PointerEvent) => {
  if (e.button !== 0) return

  const target = e.target as HTMLElement | null
  if (target?.closest('button') || target?.closest('a') || target?.closest('input')) {
    return
  }

  isDragging.value = true
  dragStart = { x: e.clientX, y: e.clientY }
  initialPosition = { ...dragPosition.value }

  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

const onDragMove = (e: PointerEvent) => {
  if (!isDragging.value) return

  const deltaX = e.clientX - dragStart.x
  const deltaY = e.clientY - dragStart.y

  let newX = initialPosition.x + deltaX
  let newY = initialPosition.y + deltaY

  if (modalRef.value) {
    const rect = modalRef.value.getBoundingClientRect()
    const currentLeft = rect.left - initialPosition.x
    const currentTop = rect.top - initialPosition.y

    const minX = -currentLeft + 10
    const maxX = window.innerWidth - (currentLeft + 80)
    const minY = -currentTop + 10
    const maxY = window.innerHeight - (currentTop + 40)

    newX = Math.max(minX, Math.min(maxX, newX))
    newY = Math.max(minY, Math.min(maxY, newY))
  }

  dragPosition.value = { x: newX, y: newY }
}

const onDragEnd = () => {
  isDragging.value = false
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      showConfirmDelete.value = false
      hasDownloaded.value = false
      showSaveForm.value = false
      hasSaved.value = false
      dragPosition.value = { x: 0, y: 0 }
    }
  }
)

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.isOpen) {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
        <div
          ref="modalRef"
          class="track-modal-card glass-panel"
          :class="{ 'is-dragging': isDragging }"
          :style="modalStyle"
          role="dialog"
          aria-modal="true"
        >
          <!-- Header (klikk og dra for å flytte) -->
          <div class="modal-header" @pointerdown="startDrag" title="Klikk og dra for å flytte">
            <div class="header-left">
              <div class="header-badge" :class="{ 'is-tracking': isTracking }">
                <Route :size="20" />
              </div>
              <div class="header-text">
                <h3 class="modal-title">GPS-sporlogg</h3>
                <span class="modal-subtitle">
                  {{ isTracking ? '🟢 Sporing pågår' : `${trackPoints.length} punkter registrert` }}
                </span>
              </div>
            </div>
            <button class="btn-close" @click="emit('close')" title="Lukk (Esc)" aria-label="Lukk">
              <X :size="18" />
            </button>
          </div>

          <!-- Innhold -->
          <div class="modal-body">
            <!-- Statistikk-grid -->
            <div class="stats-grid">
              <div class="stat-card">
                <span class="stat-label">Distanse</span>
                <span class="stat-value">{{ formatDistance(totalDistanceMeters) }}</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Varighet</span>
                <span class="stat-value">{{ durationText }}</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Punkter</span>
                <span class="stat-value">{{ trackPoints.length }}</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Startet</span>
                <span class="stat-value stat-small">{{ startTime ? formatDate(startTime) : '–' }}</span>
              </div>
            </div>

            <!-- Forklarende tekst -->
            <div class="info-banner">
              <div class="info-icon">💾</div>
              <p class="info-text">
                Sporet lagres fortløpende i nettleseren din (localStorage). Du kan laste det ned som en standard <strong>.gpx-fil</strong> for Strava, UT.no, Garmin eller Google Earth.
              </p>
            </div>

            <!-- Bekreft sletting banner hvis aktiv -->
            <Transition name="fade">
              <div v-if="showConfirmDelete" class="delete-confirm-box">
                <div class="confirm-text">
                  <AlertTriangle :size="18" class="warn-icon" />
                  <span>Er du sikker på at du vil slette dette sporet fra kartet?</span>
                </div>
                <div class="confirm-actions">
                  <button class="btn-danger-confirm" @click="handleDeleteTrack">
                    Ja, slett spor
                  </button>
                  <button class="btn-cancel" @click="showConfirmDelete = false">
                    Avbryt
                  </button>
                </div>
              </div>
            </Transition>

            <!-- Hovedhandlinger -->
            <div class="modal-actions" v-if="!showConfirmDelete">
              <!-- Lagre spor-skjema eller knapp -->
              <div v-if="showSaveForm" class="save-track-box">
                <span class="save-track-label">Gi sporet et navn:</span>
                <input
                  v-model="saveTrackName"
                  type="text"
                  class="save-track-input"
                  placeholder="Turnavn..."
                  @keydown.enter="handleConfirmSave"
                  @keydown.esc="showSaveForm = false"
                  autofocus
                />
                <div class="save-box-buttons">
                  <button class="btn-confirm-save" @click="handleConfirmSave">
                    <Check :size="15" />
                    <span>Bekreft lagring</span>
                  </button>
                  <button class="btn-cancel-save" @click="showSaveForm = false">
                    Avbryt
                  </button>
                </div>
              </div>

              <!-- Lagre spor-knapp -->
              <button
                v-else
                class="btn-action btn-save-track"
                :disabled="trackPoints.length === 0"
                @click="handleStartSave"
                title="Lagre turen til Mine spor slik at du kan hente den frem senere"
              >
                <Check v-if="hasSaved" :size="18" class="download-check" />
                <BookmarkPlus v-else :size="18" />
                <span>{{ hasSaved ? 'Sporet er lagret i Mine spor!' : 'Lagre spor til Mine spor' }}</span>
              </button>

              <!-- Last ned GPX -->
              <button
                class="btn-action btn-download"
                :disabled="trackPoints.length === 0"
                @click="handleDownloadGpx"
                title="Last ned ruten som en standard .gpx-fil"
              >
                <Check v-if="hasDownloaded" :size="18" class="download-check" />
                <Download v-else :size="18" />
                <span>{{ hasDownloaded ? 'GPX-fil lastet ned!' : 'Last ned GPX-fil' }}</span>
              </button>

              <!-- Pause / Fortsett sporing -->
              <button
                class="btn-action btn-toggle-tracking"
                :class="{ 'is-active': isTracking }"
                @click="emit('toggle-tracking')"
              >
                <Square v-if="isTracking" :size="16" />
                <Play v-else :size="16" />
                <span>{{ isTracking ? 'Stopp sporing' : 'Fortsett sporing' }}</span>
              </button>

              <!-- Slett spor -->
              <button
                class="btn-action btn-delete"
                :disabled="trackPoints.length === 0"
                @click="showConfirmDelete = true"
                title="Slett sporet fra kartet og minnet"
              >
                <Trash2 :size="16" />
                <span>Slett spor</span>
              </button>

              <!-- Snarvei til Mine lagrede spor -->
              <div class="modal-footer-link">
                <button
                  class="btn-open-saved"
                  @click="handleOpenSavedTracks"
                  title="Vis alle tidligere lagrede spor"
                >
                  <FolderHeart :size="15" />
                  <span>Mine lagrede spor ({{ trackStore.savedTracks.length }})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1350;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  padding: 16px;
  box-sizing: border-box;
}

.track-modal-card {
  width: 100%;
  max-width: 440px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  color: #f8fafc;
  overflow: hidden;
  transition: box-shadow 0.2s ease;
}

.track-modal-card.is-dragging {
  user-select: none;
  -webkit-user-select: none;
  transition: none !important;
  box-shadow: 0 35px 80px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(249, 115, 22, 0.3);
}

/* Header */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.02);
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.modal-header:active,
.track-modal-card.is-dragging .modal-header {
  cursor: grabbing;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.header-badge {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f97316, #ea580c);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(249, 115, 22, 0.4);
}

.header-badge.is-tracking {
  background: linear-gradient(135deg, #10b981, #059669);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

.header-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.modal-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #f8fafc;
}

.modal-subtitle {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 2px;
}

.btn-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.btn-close:hover {
  background: rgba(255, 255, 255, 0.18);
  color: #ffffff;
}

/* Body */
.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Stats */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.stat-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #94a3b8;
  font-weight: 600;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: #f8fafc;
}

.stat-value.stat-small {
  font-size: 13px;
  font-weight: 600;
  color: #cbd5e1;
}

/* Info Banner */
.info-banner {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 14px;
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 12px;
}

.info-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.info-text {
  margin: 0;
  font-size: 12px;
  color: #bae6fd;
  line-height: 1.45;
}

/* Bekreft sletting */
.delete-confirm-box {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.confirm-text {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #fca5a5;
  font-weight: 600;
}

.confirm-actions {
  display: flex;
  gap: 10px;
}

.btn-danger-confirm {
  flex: 1;
  padding: 10px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-danger-confirm:hover {
  background: #dc2626;
}

.btn-cancel {
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.1);
  color: #f8fafc;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Actions */
.modal-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn-action {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.15s ease;
}

.btn-download {
  background: linear-gradient(135deg, #0284c7, #2563eb);
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
  border: 1px solid #38bdf8;
}

.btn-download:hover:not(:disabled) {
  background: linear-gradient(135deg, #0369a1, #1d4ed8);
  transform: translateY(-1px);
}

.btn-download:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.download-check {
  color: #86efac;
}

.btn-toggle-tracking {
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.btn-toggle-tracking:hover {
  background: rgba(255, 255, 255, 0.15);
}

.btn-toggle-tracking.is-active {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.3);
  color: #fcd34d;
}

.btn-delete {
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.btn-delete:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border-color: #ef4444;
}

.btn-delete:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Lagre spor-seksjon */
.btn-save-track {
  background: linear-gradient(135deg, #ea580c, #c2410c);
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(234, 88, 12, 0.35);
  border: 1px solid #f97316;
}

.btn-save-track:hover:not(:disabled) {
  background: linear-gradient(135deg, #f97316, #ea580c);
  transform: translateY(-1px);
}

.btn-save-track:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.save-track-box {
  background: #0b1120;
  border: 1px solid #f97316;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.save-track-label {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
}

.save-track-input {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13.5px;
  color: #f8fafc;
  outline: none;
  transition: border-color 0.15s ease;
}

.save-track-input:focus {
  border-color: #f97316;
}

.save-box-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.btn-confirm-save {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #22c55e;
  border: none;
  color: white;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-confirm-save:hover {
  background: #16a34a;
}

.btn-cancel-save {
  background: transparent;
  border: 1px solid #475569;
  color: #94a3b8;
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-cancel-save:hover {
  background: #334155;
  color: #f8fafc;
}

.modal-footer-link {
  display: flex;
  justify-content: center;
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.btn-open-saved {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.btn-open-saved:hover {
  color: #f97316;
  background: rgba(249, 115, 22, 0.1);
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
