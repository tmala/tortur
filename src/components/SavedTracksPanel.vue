<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import {
  Route,
  X,
  Download,
  Trash2,
  Calendar,
  Clock,
  MapPin,
  Eye,
  EyeOff,
  Edit2,
  Check,
  PlusCircle,
  AlertTriangle,
  FolderHeart
} from 'lucide-vue-next'
import { useGpsTrackStore, type SavedTrack } from '@/stores/gpsTrack'
import { formatDistance, type TrackPoint } from '@/composables/useGeolocation'

const props = defineProps<{
  isOpen: boolean
  liveTrackPoints?: TrackPoint[]
  isTracking?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'view-track', track: SavedTrack | null): void
  (e: 'open-live-track-modal'): void
}>()

const trackStore = useGpsTrackStore()

// Dra/flytte-funksjonalitet
const panelRef = ref<HTMLElement | null>(null)
const dragPosition = ref({ x: 0, y: 0 })
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

  if (panelRef.value) {
    const rect = panelRef.value.getBoundingClientRect()
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
      dragPosition.value = { x: 0, y: 0 }
      editingTrackId.value = null
      trackToDelete.value = null
      isSavingLiveTrack.value = false
    }
  }
)

onUnmounted(() => {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
})

// Formatering
const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString('no-NO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString('no-NO', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

const formatDuration = (ms: number): string => {
  if (!ms || ms <= 0) return '< 1 min'
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 60) return `${totalMin} min`
  const hours = Math.floor(totalMin / 60)
  const remMin = totalMin % 60
  return remMin > 0 ? `${hours} t ${remMin} min` : `${hours} t`
}

// Total distanse for alle lagrede spor
const totalAllTracksDistanceMeters = computed(() => {
  return trackStore.savedTracks.reduce((acc, t) => acc + (t.distanceMeters || 0), 0)
})

// Redigering av navn
const editingTrackId = ref<string | null>(null)
const editingName = ref('')

const startEditing = (track: SavedTrack) => {
  editingTrackId.value = track.id
  editingName.value = track.name
}

const saveEditing = (track: SavedTrack) => {
  if (editingName.value.trim()) {
    trackStore.renameTrack(track.id, editingName.value)
  }
  editingTrackId.value = null
}

const cancelEditing = () => {
  editingTrackId.value = null
}

// Sletting med bekreftelse
const trackToDelete = ref<SavedTrack | null>(null)

const confirmDelete = (track: SavedTrack) => {
  trackToDelete.value = track
}

const executeDelete = () => {
  if (trackToDelete.value) {
    const wasActive = trackStore.activeTrackId === trackToDelete.value.id
    trackStore.deleteTrack(trackToDelete.value.id)
    if (wasActive) {
      emit('view-track', null)
    }
    trackToDelete.value = null
  }
}

// Vis/skjul spor på kartet
const handleToggleViewOnMap = (track: SavedTrack) => {
  const isCurrentlyActive = trackStore.activeTrackId === track.id
  trackStore.viewTrackOnMap(track.id)
  if (isCurrentlyActive) {
    emit('view-track', null)
  } else {
    emit('view-track', track)
  }
}

// Lagre live-spor direkte fra dette panelet
const isSavingLiveTrack = ref(false)
const newLiveTrackName = ref('')

const handleStartSaveLiveTrack = () => {
  isSavingLiveTrack.value = true
  const now = new Date()
  const dateStr = now.toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })
  const timeStr = now.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })
  newLiveTrackName.value = `Tur ${dateStr}, kl. ${timeStr}`
}

const handleConfirmSaveLiveTrack = () => {
  if (!props.liveTrackPoints || props.liveTrackPoints.length === 0) return
  const saved = trackStore.saveTrack(props.liveTrackPoints, newLiveTrackName.value)
  isSavingLiveTrack.value = false
  newLiveTrackName.value = ''
  if (saved) {
    // Vis det nye sporet på kartet
    handleToggleViewOnMap(saved)
  }
}
</script>

<template>
  <transition name="fade-slide">
    <div
      v-if="isOpen"
      ref="panelRef"
      class="saved-tracks-panel glass-panel"
      :class="{ 'is-dragging': isDragging }"
      :style="panelStyle"
      role="dialog"
      aria-label="Mine GPS-spor"
    >
      <!-- Header (klikk og dra for å flytte) -->
      <div class="panel-header" @pointerdown="startDrag" title="Klikk og dra for å flytte">
        <div class="header-title">
          <div class="header-icon-wrap">
            <Route :size="18" class="header-icon" />
          </div>
          <h3>Mine GPS-spor</h3>
          <span class="tracks-count-badge">{{ trackStore.savedTracks.length }}</span>
        </div>
        <button class="btn-close" @click="emit('close')" title="Lukk (Esc)" aria-label="Lukk">
          <X :size="18" />
        </button>
      </div>

      <!-- Statistikk-sammendrag -->
      <div class="summary-bar" v-if="trackStore.savedTracks.length > 0">
        <div class="summary-item">
          <span class="summary-label">Lagrede turer</span>
          <span class="summary-val">{{ trackStore.savedTracks.length }}</span>
        </div>
        <div class="summary-divider" />
        <div class="summary-item">
          <span class="summary-label">Total distanse</span>
          <span class="summary-val">{{ formatDistance(totalAllTracksDistanceMeters) }}</span>
        </div>
      </div>

      <!-- Banner for aktiv live-sporing hvis det finnes data -->
      <div
        v-if="liveTrackPoints && liveTrackPoints.length > 0"
        class="live-track-banner"
      >
        <div class="live-track-info">
          <div class="live-pulse-dot" :class="{ 'is-tracking': isTracking }" />
          <div class="live-texts">
            <span class="live-title">
              {{ isTracking ? 'Pågående opptak' : 'Aktiv sporlogg i minnet' }}
            </span>
            <span class="live-details">
              {{ liveTrackPoints.length }} punkter registrert
            </span>
          </div>
        </div>

        <div v-if="!isSavingLiveTrack" class="live-actions">
          <button
            class="btn-quick-save"
            @click="handleStartSaveLiveTrack"
            title="Lagre denne turen til Mine spor"
          >
            <PlusCircle :size="14" />
            <span>Lagre tur</span>
          </button>
          <button
            class="btn-view-live"
            @click="emit('open-live-track-modal')"
            title="Åpne full sporlogg-dialog"
          >
            Detaljer
          </button>
        </div>

        <!-- Inline lagringsskjema -->
        <div v-else class="live-save-form">
          <input
            v-model="newLiveTrackName"
            type="text"
            class="input-track-name"
            placeholder="Navn på turen..."
            @keydown.enter="handleConfirmSaveLiveTrack"
            @keydown.esc="isSavingLiveTrack = false"
            autofocus
          />
          <div class="save-form-buttons">
            <button class="btn-confirm-save" @click="handleConfirmSaveLiveTrack">
              <Check :size="14" />
              <span>Lagre</span>
            </button>
            <button class="btn-cancel-save" @click="isSavingLiveTrack = false">
              Avbryt
            </button>
          </div>
        </div>
      </div>

      <!-- Slettebekreftelse dialog/banner -->
      <transition name="fade">
        <div v-if="trackToDelete" class="delete-confirm-overlay">
          <div class="delete-card">
            <div class="delete-card-header">
              <AlertTriangle :size="20" class="warn-icon" />
              <h4>Slette spor?</h4>
            </div>
            <p class="delete-card-text">
              Er du sikker på at du vil slette <strong>«{{ trackToDelete.name }}»</strong>? Dette kan ikke angres.
            </p>
            <div class="delete-card-actions">
              <button class="btn-delete-confirm" @click="executeDelete">
                Ja, slett
              </button>
              <button class="btn-delete-cancel" @click="trackToDelete = null">
                Avbryt
              </button>
            </div>
          </div>
        </div>
      </transition>

      <!-- Liste over spor -->
      <div class="tracks-list-container">
        <!-- Tom tilstand -->
        <div v-if="trackStore.savedTracks.length === 0" class="empty-state">
          <div class="empty-icon-wrap">
            <FolderHeart :size="36" class="empty-icon" />
          </div>
          <h4>Ingen lagrede spor ennå</h4>
          <p>
            Bruk <strong>«Følg meg»</strong>-knappen i kartet for å spore turen din. Når du er ferdig, kan du lagre sporet her for å hente det frem og se det på kartet når som helst!
          </p>
        </div>

        <!-- Spor-kort -->
        <div
          v-for="track in trackStore.savedTracks"
          :key="track.id"
          class="track-card"
          :class="{ 'is-active-on-map': trackStore.activeTrackId === track.id }"
        >
          <!-- Topprad: Tittel og rediger-ikon -->
          <div class="track-card-header">
            <div v-if="editingTrackId !== track.id" class="track-title-wrap">
              <span class="track-name" :title="track.name">{{ track.name }}</span>
              <button
                class="btn-icon-subtle"
                @click="startEditing(track)"
                title="Endre navn"
              >
                <Edit2 :size="13" />
              </button>
            </div>

            <!-- Inline redigering av navn -->
            <div v-else class="track-rename-row">
              <input
                v-model="editingName"
                type="text"
                class="input-inline-rename"
                @keydown.enter="saveEditing(track)"
                @keydown.esc="cancelEditing"
                autofocus
              />
              <button class="btn-icon-check" @click="saveEditing(track)" title="Lagre">
                <Check :size="14" />
              </button>
              <button class="btn-icon-cancel" @click="cancelEditing" title="Avbryt">
                <X :size="14" />
              </button>
            </div>

            <!-- Aktiv status-indikator på kart -->
            <span
              v-if="trackStore.activeTrackId === track.id"
              class="badge-active-map"
              title="Vises nå på kartet"
            >
              Vises på kart
            </span>
          </div>

          <!-- Metadata-rad: Distanse, varighet, dato -->
          <div class="track-meta-row">
            <div class="meta-item">
              <MapPin :size="13" class="meta-icon" />
              <span>{{ formatDistance(track.distanceMeters) }}</span>
            </div>
            <div class="meta-item">
              <Clock :size="13" class="meta-icon" />
              <span>{{ formatDuration(track.durationMs) }}</span>
            </div>
            <div class="meta-item">
              <Calendar :size="13" class="meta-icon" />
              <span>{{ formatDate(track.createdAt) }}</span>
            </div>
          </div>

          <!-- Handlingsknapper -->
          <div class="track-actions-row">
            <!-- Vis på kart / Skjul -->
            <button
              class="btn-track-action btn-view-map"
              :class="{ active: trackStore.activeTrackId === track.id }"
              @click="handleToggleViewOnMap(track)"
              :title="trackStore.activeTrackId === track.id ? 'Skjul fra kart' : 'Vis på kart og zoom til sporet'"
            >
              <EyeOff v-if="trackStore.activeTrackId === track.id" :size="14" />
              <Eye v-else :size="14" />
              <span>{{ trackStore.activeTrackId === track.id ? 'Skjul fra kart' : 'Vis på kart' }}</span>
            </button>

            <!-- Last ned GPX -->
            <button
              class="btn-track-action btn-download-gpx"
              @click="trackStore.downloadGpx(track)"
              title="Last ned standard .gpx-fil"
            >
              <Download :size="14" />
              <span>GPX</span>
            </button>

            <!-- Slett -->
            <button
              class="btn-track-action btn-delete-track"
              @click="confirmDelete(track)"
              title="Slett spor"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.saved-tracks-panel {
  position: absolute;
  top: calc(72px + env(safe-area-inset-top, 0px));
  right: calc(16px + env(safe-area-inset-right, 0px));
  width: 390px;
  max-width: calc(100vw - 32px);
  max-height: calc(100dvh - 150px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  z-index: 25;
  overflow: hidden;
  padding: 0;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75);
  pointer-events: auto;
  color: #f8fafc;
  transition: box-shadow 0.2s ease;
}

.saved-tracks-panel.is-dragging {
  user-select: none;
  -webkit-user-select: none;
  transition: none !important;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(249, 115, 22, 0.4);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #334155;
  background: #1e293b;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.panel-header:active,
.saved-tracks-panel.is-dragging .panel-header {
  cursor: grabbing;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon-wrap {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(249, 115, 22, 0.15);
  border: 1px solid rgba(249, 115, 22, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-icon {
  color: #f97316;
}

.header-title h3 {
  font-size: 15px;
  font-weight: 700;
  color: #f8fafc;
  margin: 0;
}

.tracks-count-badge {
  background: #334155;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
}

.btn-close {
  background: #334155;
  border: none;
  color: #cbd5e1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.btn-close:hover {
  color: white;
  background: #475569;
}

/* Sammendragslinje */
.summary-bar {
  display: flex;
  align-items: center;
  background: #0b1120;
  border-bottom: 1px solid #1e293b;
  padding: 8px 16px;
}

.summary-item {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.summary-label {
  font-size: 10.5px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.summary-val {
  font-size: 14px;
  font-weight: 700;
  color: #f8fafc;
}

.summary-divider {
  width: 1px;
  height: 24px;
  background: #334155;
  margin: 0 12px;
}

/* Banner for aktiv live-sporing */
.live-track-banner {
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.12), rgba(15, 23, 42, 0.9));
  border-bottom: 1px solid rgba(249, 115, 22, 0.3);
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.live-track-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.live-pulse-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #f97316;
  box-shadow: 0 0 8px #f97316;
}

.live-pulse-dot.is-tracking {
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
  animation: pulse-ring 1.5s infinite;
}

@keyframes pulse-ring {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px rgba(34, 197, 94, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
  }
}

.live-texts {
  display: flex;
  flex-direction: column;
}

.live-title {
  font-size: 12.5px;
  font-weight: 600;
  color: #f8fafc;
}

.live-details {
  font-size: 11px;
  color: #94a3b8;
}

.live-actions {
  display: flex;
  gap: 8px;
}

.btn-quick-save {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: #ea580c;
  color: white;
  border: none;
  padding: 6px 10px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-quick-save:hover {
  background: #c2410c;
}

.btn-view-live {
  background: #1e293b;
  border: 1px solid #334155;
  color: #cbd5e1;
  padding: 6px 10px;
  border-radius: 7px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-view-live:hover {
  background: #334155;
  color: white;
}

.live-save-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.input-track-name {
  background: #0b1120;
  border: 1px solid #ea580c;
  border-radius: 7px;
  padding: 6px 10px;
  font-size: 12px;
  color: white;
  outline: none;
}

.save-form-buttons {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.btn-confirm-save {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #22c55e;
  border: none;
  color: white;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.btn-cancel-save {
  background: transparent;
  border: 1px solid #475569;
  color: #94a3b8;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11.5px;
  cursor: pointer;
}

/* Slettekort bekreftelse */
.delete-confirm-overlay {
  background: rgba(15, 23, 42, 0.95);
  border-bottom: 1px solid #ef4444;
  padding: 12px 16px;
}

.delete-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.delete-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #f87171;
}

.delete-card-header h4 {
  font-size: 13.5px;
  font-weight: 700;
  margin: 0;
}

.delete-card-text {
  font-size: 12px;
  color: #cbd5e1;
  margin: 0;
  line-height: 1.4;
}

.delete-card-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}

.btn-delete-confirm {
  background: #ef4444;
  color: white;
  border: none;
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.btn-delete-cancel {
  background: #334155;
  color: #cbd5e1;
  border: none;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

/* Liste med spor */
.tracks-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tracks-list-container::-webkit-scrollbar {
  width: 6px;
}

.tracks-list-container::-webkit-scrollbar-thumb {
  background: #334155;
  border-radius: 3px;
}

/* Tom tilstand */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 36px 16px;
  color: #94a3b8;
}

.empty-icon-wrap {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(51, 65, 85, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
}

.empty-icon {
  color: #64748b;
}

.empty-state h4 {
  font-size: 14.5px;
  font-weight: 700;
  color: #f8fafc;
  margin: 0 0 8px 0;
}

.empty-state p {
  font-size: 12px;
  line-height: 1.5;
  color: #94a3b8;
  margin: 0;
  max-width: 290px;
}

/* Spor-kort */
.track-card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.15s ease;
}

.track-card:hover {
  border-color: #475569;
  background: #243044;
}

.track-card.is-active-on-map {
  border-color: #f97316;
  background: rgba(249, 115, 22, 0.08);
  box-shadow: 0 0 12px rgba(249, 115, 22, 0.15);
}

.track-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.track-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.track-name {
  font-size: 13.5px;
  font-weight: 600;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-icon-subtle {
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease;
}

.btn-icon-subtle:hover {
  color: #cbd5e1;
}

.track-rename-row {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
}

.input-inline-rename {
  flex: 1;
  background: #0f172a;
  border: 1px solid #38bdf8;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12.5px;
  color: white;
  outline: none;
}

.btn-icon-check {
  background: #22c55e;
  border: none;
  color: white;
  padding: 4px;
  border-radius: 5px;
  cursor: pointer;
}

.btn-icon-cancel {
  background: #475569;
  border: none;
  color: white;
  padding: 4px;
  border-radius: 5px;
  cursor: pointer;
}

.badge-active-map {
  font-size: 10.5px;
  font-weight: 700;
  color: #ea580c;
  background: rgba(249, 115, 22, 0.15);
  border: 1px solid rgba(249, 115, 22, 0.35);
  padding: 2px 7px;
  border-radius: 10px;
  white-space: nowrap;
}

/* Metadata */
.track-meta-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11.5px;
  color: #94a3b8;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.meta-icon {
  color: #64748b;
}

/* Handlingsknapper */
.track-actions-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  padding-top: 8px;
  border-top: 1px solid rgba(51, 65, 85, 0.6);
}

.btn-track-action {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 7px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-view-map {
  flex: 1;
  background: #0f172a;
  border: 1px solid #334155;
  color: #e2e8f0;
}

.btn-view-map:hover {
  background: #334155;
  color: white;
  border-color: #475569;
}

.btn-view-map.active {
  background: #ea580c;
  border-color: #f97316;
  color: white;
  font-weight: 600;
}

.btn-download-gpx {
  background: #0f172a;
  border: 1px solid #334155;
  color: #94a3b8;
}

.btn-download-gpx:hover {
  background: #334155;
  color: #38bdf8;
  border-color: #38bdf8;
}

.btn-delete-track {
  background: #0f172a;
  border: 1px solid #334155;
  color: #94a3b8;
  padding: 6px 8px;
}

.btn-delete-track:hover {
  background: #ef4444;
  border-color: #ef4444;
  color: white;
}

/* Animasjoner */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
