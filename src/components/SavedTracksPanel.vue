<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
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
  FolderHeart,
  RefreshCw,
  Loader2,
  ChevronDown,
  Globe,
  Users,
  Lock
} from 'lucide-vue-next'
import { useGpsTrackStore, type SavedTrack, type TrackVisibility } from '@/stores/gpsTrack'
import { formatDistance, type TrackPoint } from '@/composables/useGeolocation'
import TrackPhotosSection from '@/components/TrackPhotosSection.vue'
import TrackVisibilitySelector from '@/components/TrackVisibilitySelector.vue'
import MonthGroupHeader from './MonthGroupHeader.vue'

const props = defineProps<{
  isOpen: boolean
  liveTrackPoints?: TrackPoint[]
  isTracking?: boolean
  isLoggedIn?: boolean
  highlightedTrackId?: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'view-track', track: SavedTrack | null): void
  (e: 'open-live-track-modal'): void
}>()

const trackStore = useGpsTrackStore()

const handleManualSync = async () => {
  if (trackStore.isSyncing) return
  await trackStore.syncTracksWithFirebase()
}

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

const activeHighlightId = ref<string | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | null = null

const scrollToHighlightedTrack = () => {
  const targetId = props.highlightedTrackId || trackStore.activeTrackId
  if (!targetId) return

  activeHighlightId.value = targetId
  if (highlightTimer) clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => {
    activeHighlightId.value = null
  }, 2500)

  // Finn og ekspander måneden sporet tilhører
  const targetTrack = trackStore.savedTracks.find((t) => t.id === targetId)
  if (targetTrack) {
    const time = targetTrack.startTime || targetTrack.createdAt
    const d = new Date(time)
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const nextMonths = new Set(expandedMonthKeys.value)
    nextMonths.add(monthKey)
    expandedMonthKeys.value = nextMonths
  }

  // Ekspander det highlightede sporet automatisk
  if (!expandedTrackIds.value.has(targetId)) {
    const next = new Set(expandedTrackIds.value)
    next.add(targetId)
    expandedTrackIds.value = next
  }

  nextTick(() => {
    const el = document.getElementById(`track-card-${targetId}`)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  })
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      dragPosition.value = { x: 0, y: 0 }
      editingTrackId.value = null
      trackToDelete.value = null
      isSavingLiveTrack.value = false
      if (monthGroups.value.length > 0) {
        expandedMonthKeys.value = new Set([monthGroups.value[0]!.key])
      }
      if (props.highlightedTrackId) {
        scrollToHighlightedTrack()
      }
    }
  }
)

watch(
  () => props.highlightedTrackId,
  (newId) => {
    if (newId && props.isOpen) {
      scrollToHighlightedTrack()
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
  if (props.isOpen) {
    scrollToHighlightedTrack()
  }
})

onUnmounted(() => {
  if (highlightTimer) {
    clearTimeout(highlightTimer)
  }
  window.removeEventListener('keydown', handleKeyDown)
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

export interface MonthGroup {
  key: string
  label: string
  tracks: SavedTrack[]
  totalDistanceMeters: number
}

// Gruppering av spor per måned
const expandedMonthKeys = ref<Set<string>>(new Set())
const hasInitializedDefaultMonth = ref(false)

const isMonthExpanded = (key: string): boolean => {
  return expandedMonthKeys.value.has(key)
}

const toggleMonth = (key: string) => {
  const next = new Set(expandedMonthKeys.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  expandedMonthKeys.value = next
}

const monthGroups = computed<MonthGroup[]>(() => {
  const groupsMap = new Map<string, { label: string; tracks: SavedTrack[]; totalDistance: number }>()

  // Sorter sporer nyeste først
  const sorted = [...trackStore.savedTracks].sort((a, b) => {
    const timeA = a.startTime || a.createdAt
    const timeB = b.startTime || b.createdAt
    return timeB - timeA
  })

  for (const track of sorted) {
    const time = track.startTime || track.createdAt
    const d = new Date(time)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

    if (!groupsMap.has(key)) {
      const monthName = d.toLocaleDateString('no-NO', { month: 'long', year: 'numeric' })
      const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1)
      groupsMap.set(key, {
        label: capitalized,
        tracks: [],
        totalDistance: 0
      })
    }

    const group = groupsMap.get(key)!
    group.tracks.push(track)
    group.totalDistance += track.distanceMeters || 0
  }

  return Array.from(groupsMap.entries()).map(([key, data]) => ({
    key,
    label: data.label,
    tracks: data.tracks,
    totalDistanceMeters: data.totalDistance
  }))
})

// Åpne nyeste måned som standard ved initialisering
watch(
  monthGroups,
  (groups) => {
    if (groups.length > 0 && !hasInitializedDefaultMonth.value) {
      hasInitializedDefaultMonth.value = true
      expandedMonthKeys.value = new Set([groups[0]!.key])
    }
  },
  { immediate: true }
)

// Ekspandering av spor (flere kan være åpne samtidig)
const expandedTrackIds = ref<Set<string>>(new Set())

const isExpanded = (id: string): boolean => {
  return expandedTrackIds.value.has(id)
}

const toggleExpand = (id: string) => {
  const next = new Set(expandedTrackIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  expandedTrackIds.value = next
}

const onTrackHeaderClick = (track: SavedTrack) => {
  if (editingTrackId.value === track.id) return
  toggleExpand(track.id)
}

// Redigering av navn
const editingTrackId = ref<string | null>(null)
const editingName = ref('')

const startEditing = (track: SavedTrack) => {
  if (!expandedTrackIds.value.has(track.id)) {
    const next = new Set(expandedTrackIds.value)
    next.add(track.id)
    expandedTrackIds.value = next
  }
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
    const idToDelete = trackToDelete.value.id
    trackStore.deleteTrack(idToDelete)
    if (expandedTrackIds.value.has(idToDelete)) {
      const next = new Set(expandedTrackIds.value)
      next.delete(idToDelete)
      expandedTrackIds.value = next
    }
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

const handleSetVisibility = (track: SavedTrack, visibility: TrackVisibility) => {
  trackStore.setTrackVisibility(track.id, visibility)
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
  <Teleport to="body">
    <transition name="tracks-modal-fade">
      <div v-if="isOpen" class="saved-tracks-backdrop" @click.self="emit('close')">
        <div
          ref="panelRef"
          class="saved-tracks-panel glass-panel"
          :class="{ 'is-dragging': isDragging }"
          :style="panelStyle"
          role="dialog"
          aria-modal="true"
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
        <div class="header-actions">
          <button
            v-if="isLoggedIn"
            class="btn-sync"
            :class="{ 'is-syncing': trackStore.isSyncing }"
            :disabled="trackStore.isSyncing"
            @click="handleManualSync"
            title="Synkroniser med skyen (Firebase)"
            aria-label="Synkroniser med skyen"
          >
            <Loader2 v-if="trackStore.isSyncing" class="spinner" :size="15" />
            <RefreshCw v-else :size="15" />
          </button>
          <button class="btn-close" @click="emit('close')" title="Lukk (Esc)" aria-label="Lukk">
            <X :size="18" />
          </button>
        </div>
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
        <div class="summary-divider" v-if="isLoggedIn" />
        <div class="summary-item" v-if="isLoggedIn" :title="trackStore.syncError || 'Synkronisert med skyen'">
          <span class="summary-label">Sky-status</span>
          <span v-if="trackStore.isSyncing" class="summary-val status-syncing">Synker...</span>
          <span v-else-if="trackStore.syncError" class="summary-val status-error">Kun lokal</span>
          <span v-else class="summary-val status-synced">Sky</span>
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

        <!-- Månedsgruppert liste over spor -->
        <div
          v-for="group in monthGroups"
          :key="group.key"
          class="month-group"
        >
          <!-- Måneds-overskrift (klikkbar for å ekspandere / kollapse måneden) -->
          <MonthGroupHeader
            :label="group.label"
            :count="group.tracks.length"
            count-unit-single="tur"
            count-unit-plural="turer"
            accent-color="#ea580c"
            :is-expanded="isMonthExpanded(group.key)"
            @toggle="toggleMonth(group.key)"
          >
            <template #right>
              <span class="month-distance">{{ formatDistance(group.totalDistanceMeters) }}</span>
            </template>
          </MonthGroupHeader>

          <!-- Spor i denne måneden -->
          <div v-if="isMonthExpanded(group.key)" class="month-tracks-list">
            <!-- Spor-kort -->
            <div
              v-for="track in group.tracks"
              :id="`track-card-${track.id}`"
              :key="track.id"
              class="track-card"
              :class="{
                'is-active-on-map': trackStore.activeTrackId === track.id,
                'is-highlighted': activeHighlightId === track.id,
                'is-expanded': isExpanded(track.id)
              }"
            >
              <!-- Topprad: Tittel og chevron (klikkbar for å ekspandere / kollapse) -->
              <div
                class="track-card-header"
                :class="{ 'is-clickable': editingTrackId !== track.id }"
                @click="onTrackHeaderClick(track)"
              >
                <div v-if="editingTrackId !== track.id" class="track-title-wrap">
                  <span class="track-name" :title="track.name">{{ track.name }}</span>
                  <button
                    v-if="isExpanded(track.id)"
                    class="btn-icon-subtle"
                    @click.stop="startEditing(track)"
                    title="Endre navn"
                    aria-label="Endre navn"
                  >
                    <Edit2 :size="13" />
                  </button>
                </div>

                <!-- Inline redigering av navn -->
                <div v-else class="track-rename-row" @click.stop>
                  <input
                    v-model="editingName"
                    type="text"
                    class="input-inline-rename"
                    @keydown.enter="saveEditing(track)"
                    @keydown.esc="cancelEditing"
                    autofocus
                  />
                  <button class="btn-icon-check" @click="saveEditing(track)" title="Lagre" aria-label="Lagre">
                    <Check :size="14" />
                  </button>
                  <button class="btn-icon-cancel" @click="cancelEditing" title="Avbryt" aria-label="Avbryt">
                    <X :size="14" />
                  </button>
                </div>

                <div class="track-header-right">
                  <!-- Synlighets-badge -->
                  <span
                    class="badge-track-vis"
                    :class="`vis-${track.visibility || 'private'}`"
                    :title="
                      track.visibility === 'all'
                        ? 'Offentlig: Synlig for alle'
                        : track.visibility === 'friends'
                          ? 'Synlig for venner'
                          : 'Privat: Kun synlig for deg'
                    "
                  >
                    <Globe v-if="track.visibility === 'all'" :size="10" />
                    <Users v-else-if="track.visibility === 'friends'" :size="10" />
                    <Lock v-else :size="10" />
                    <span>
                      {{
                        track.visibility === 'all'
                          ? 'Alle'
                          : track.visibility === 'friends'
                            ? 'Venner'
                            : 'Privat'
                      }}
                    </span>
                  </span>

                  <!-- Aktiv status-indikator på kart -->
                  <span
                    v-if="trackStore.activeTrackId === track.id"
                    class="badge-active-map"
                    title="Vises nå på kartet"
                  >
                    Vises på kart
                  </span>

                  <!-- Ekspander / kollaps chevron -->
                  <button
                    type="button"
                    class="btn-icon-expand"
                    :title="isExpanded(track.id) ? 'Kollaps spor' : 'Ekspander spor'"
                    :aria-label="isExpanded(track.id) ? 'Kollaps spor' : 'Ekspander spor'"
                    :aria-expanded="isExpanded(track.id)"
                    @click.stop="toggleExpand(track.id)"
                  >
                    <ChevronDown
                      :size="16"
                      class="chevron-icon"
                      :class="{ rotated: isExpanded(track.id) }"
                    />
                  </button>
                </div>
              </div>

              <!-- Metadata-rad: Distanse, varighet, dato -->
              <div
                class="track-meta-row"
                :class="{ 'is-clickable': !isExpanded(track.id) }"
                @click="!isExpanded(track.id) && toggleExpand(track.id)"
              >
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
                  <span>{{ formatDate(track.startTime || track.createdAt) }}</span>
                </div>
              </div>

              <!-- Ekspandert innhold: Handlingsknapper og turbilder -->
              <div v-if="isExpanded(track.id)" class="track-expanded-body">
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
                    aria-label="Slett spor"
                  >
                    <Trash2 :size="14" />
                  </button>
                </div>

                <!-- Synlighetsvelger -->
                <TrackVisibilitySelector
                  :model-value="track.visibility || 'private'"
                  label="Hvem kan se dette sporet?"
                  @update:model-value="(val) => handleSetVisibility(track, val)"
                />

                <!-- Turbilder for sporet (kun for egne spor når innlogget) -->
                <TrackPhotosSection
                  v-if="isLoggedIn && track.userId === trackStore.currentUserId"
                  :track="track"
                  :user-id="trackStore.currentUserId"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</transition>
</Teleport>
</template>

<style scoped>
.saved-tracks-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(10, 15, 25, 0.75);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 10500;
  padding: clamp(20px, 6vh, 48px) 16px 24px;
}

.saved-tracks-panel {
  position: relative;
  top: auto;
  right: auto;
  width: 100%;
  max-width: 550px;
  max-height: calc(100vh - clamp(20px, 6vh, 48px) - 24px);
  min-height: 380px;
  display: flex;
  flex-direction: column;
  z-index: 10501;
  overflow: hidden;
  padding: 0;
  background: rgba(24, 30, 42, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 20px;
  box-shadow:
    0 20px 48px rgba(0, 0, 0, 0.55),
    0 0 0 1px rgba(255, 255, 255, 0.08);
  pointer-events: auto;
  color: #f8fafc;
  transition: box-shadow 0.2s ease;
  user-select: none;
}

.saved-tracks-panel.is-dragging {
  user-select: none;
  -webkit-user-select: none;
  transition: none !important;
  box-shadow: 0 28px 60px rgba(0, 0, 0, 0.7);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
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
  gap: 12px;
}

.header-icon-wrap {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(249, 115, 22, 0.35);
}

.header-icon {
  color: #fff;
}

.header-title h3 {
  font-size: 1.05rem;
  font-weight: 700;
  color: #f8fafc;
  letter-spacing: -0.01em;
  margin: 0;
}

.tracks-count-badge {
  background: rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-sync {
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 10px;
  color: #9ca3af;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-sync:hover:not(:disabled) {
  color: #38bdf8;
  background: rgba(255, 255, 255, 0.16);
}

.btn-sync:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.btn-close {
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 10px;
  color: #9ca3af;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-close:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
}

.tracks-modal-fade-enter-active,
.tracks-modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.tracks-modal-fade-enter-from,
.tracks-modal-fade-leave-to {
  opacity: 0;
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

.summary-val.status-synced {
  color: #38bdf8;
}

.summary-val.status-syncing {
  color: #fbbf24;
}

.summary-val.status-error {
  color: #f87171;
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
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  scrollbar-gutter: stable;
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

/* Månedsgruppering */
.month-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.month-distance {
  font-size: 11.5px;
  font-weight: 600;
  color: #94a3b8;
}

.month-tracks-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  animation: expand-fade 0.2s ease-out;
}

/* Spor-kort */
.track-card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all 0.15s ease;
}

.track-card.is-expanded {
  padding: 12px;
  gap: 10px;
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

.track-card.is-highlighted {
  animation: track-card-pulse 1.2s ease-in-out 2;
}

@keyframes track-card-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(249, 115, 22, 0);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.45), 0 0 20px rgba(249, 115, 22, 0.4);
    border-color: #f97316;
  }
}

.track-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.track-card-header.is-clickable {
  cursor: pointer;
}

.track-card-header.is-clickable:hover .track-name {
  color: #38bdf8;
}

.track-header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.badge-track-vis {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}

.badge-track-vis.vis-all {
  background: rgba(14, 165, 233, 0.15);
  border: 1px solid rgba(14, 165, 233, 0.4);
  color: #38bdf8;
}

.badge-track-vis.vis-friends {
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #34d399;
}

.badge-track-vis.vis-private {
  background: rgba(148, 163, 184, 0.12);
  border: 1px solid rgba(148, 163, 184, 0.25);
  color: #94a3b8;
}

.btn-icon-expand {
  background: transparent;
  border: none;
  color: #94a3b8;
  padding: 3px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-icon-expand:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}

.chevron-icon {
  color: #64748b;
  transition: transform 0.2s ease, color 0.15s ease;
}

.chevron-icon.rotated {
  transform: rotate(180deg);
  color: #ea580c;
}

.track-meta-row.is-clickable {
  cursor: pointer;
}

.track-expanded-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  animation: expand-fade 0.2s ease-out;
}

@keyframes expand-fade {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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
