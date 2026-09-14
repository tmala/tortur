<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  X,
  Upload,
  Route,
  Check,
  Loader2,
  AlertCircle,
  Calendar,
  Search,
  CheckCircle2,
} from 'lucide-vue-next'
import { useGpsTrackStore, type SavedTrack } from '@/stores/gpsTrack'
import { formatDistance } from '@/composables/useGeolocation'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    currentTrackId?: string | null
  }>(),
  {
    currentTrackId: null,
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', track: SavedTrack | null): void
}>()

const trackStore = useGpsTrackStore()

const selectedTrackId = ref<string | null>(props.currentTrackId || null)
const searchQuery = ref('')
const isUploading = ref(false)
const uploadError = ref<string | null>(null)
const uploadSuccess = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

// Tilbakestill tilstand når modalen åpnes
watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      selectedTrackId.value = props.currentTrackId || null
      searchQuery.value = ''
      uploadError.value = null
      uploadSuccess.value = null
    }
  },
)

// Filtrerte spor basert på søkeord
const filteredTracks = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return trackStore.savedTracks
  return trackStore.savedTracks.filter((t) => t.name.toLowerCase().includes(query))
})

// Valgt spor-objekt
const selectedTrack = computed<SavedTrack | null>(() => {
  if (!selectedTrackId.value) return null
  return trackStore.savedTracks.find((t) => t.id === selectedTrackId.value) || null
})

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '0 min'
  const totalMinutes = Math.round(ms / (1000 * 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) {
    return `${hours} t ${minutes} min`
  }
  return `${minutes} min`
}

function formatDate(timestamp: number): string {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  return d.toLocaleDateString('no-NO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function triggerFileUpload() {
  uploadError.value = null
  uploadSuccess.value = null
  fileInputRef.value?.click()
}

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  // Sjekk filendelse
  if (!file.name.toLowerCase().endsWith('.gpx')) {
    uploadError.value = 'Vennligst velg en gyldig GPX-fil (.gpx).'
    if (fileInputRef.value) fileInputRef.value.value = ''
    return
  }

  isUploading.value = true
  uploadError.value = null
  uploadSuccess.value = null

  try {
    const newTrack = await trackStore.importGpx(file)
    selectedTrackId.value = newTrack.id
    uploadSuccess.value = `Sporet «${newTrack.name}» ble importert og valgt!`
  } catch (err: unknown) {
    uploadError.value = err instanceof Error ? err.message : 'Kunne ikke importere GPX-filen.'
  } finally {
    isUploading.value = false
    if (fileInputRef.value) fileInputRef.value.value = ''
  }
}

function selectTrack(track: SavedTrack | null) {
  selectedTrackId.value = track ? track.id : null
}

function selectAndConfirm(track: SavedTrack | null) {
  selectedTrackId.value = track ? track.id : null
  handleConfirm()
}

function handleConfirm() {
  emit('select', selectedTrack.value)
  emit('close')
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
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
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="track-picker-title"
      @click.self="emit('close')"
    >
      <div class="modal-card">
        <!-- Header -->
        <div class="modal-header">
          <div class="header-left">
            <Route class="header-icon" />
            <h2 id="track-picker-title" class="header-title">Velg eller last opp GPS-spor</h2>
          </div>
          <button
            type="button"
            class="close-button"
            aria-label="Lukk modal"
            @click="emit('close')"
          >
            <X class="icon-sm" />
          </button>
        </div>

        <!-- GPX-opplasting -->
        <div class="upload-section">
          <input
            ref="fileInputRef"
            type="file"
            accept=".gpx,application/gpx+xml,text/xml"
            class="hidden-file-input"
            aria-label="Last opp GPX-fil"
            @change="handleFileChange"
          />
          <button
            type="button"
            class="upload-btn"
            :disabled="isUploading"
            aria-label="Last opp GPX-fil fra enheten"
            @click="triggerFileUpload"
          >
            <Loader2 v-if="isUploading" class="icon-spin icon-sm" />
            <Upload v-else class="icon-sm" />
            <span>{{ isUploading ? 'Importerer GPX...' : 'Last opp GPX-fil' }}</span>
          </button>
          <span class="upload-hint">Støtter standard GPX fra Garmin, Strava, Sports Tracker osv.</span>
        </div>

        <!-- Statusvarsler -->
        <div v-if="uploadError" class="alert-box error" role="alert">
          <AlertCircle class="alert-icon" />
          <span>{{ uploadError }}</span>
        </div>
        <div v-if="uploadSuccess" class="alert-box success" role="status">
          <CheckCircle2 class="alert-icon" />
          <span>{{ uploadSuccess }}</span>
        </div>

        <!-- Søk og sporliste -->
        <div class="tracks-list-container">
          <div class="tracks-header">
            <span class="section-label">Dine lagrede spor ({{ trackStore.savedTracks.length }})</span>
            <div v-if="trackStore.savedTracks.length > 3" class="search-wrap">
              <Search class="search-icon" />
              <input
                v-model="searchQuery"
                type="search"
                placeholder="Søk i spor..."
                class="search-input"
                aria-label="Søk i spor"
              />
            </div>
          </div>

          <!-- Valg: Intet spor -->
          <div
            class="track-option empty-option"
            :class="{ active: selectedTrackId === null }"
            role="button"
            tabindex="0"
            aria-label="Intet GPS-spor"
            @click="selectTrack(null)"
            @dblclick="selectAndConfirm(null)"
            @keydown.enter="selectTrack(null)"
            @keydown.space.prevent="selectTrack(null)"
          >
            <div class="track-info">
              <span class="track-name">Intet GPS-spor tilknyttet</span>
              <span class="track-meta">Innsjekkingen vises uten sporlinje</span>
            </div>
            <div v-if="selectedTrackId === null" class="check-badge">
              <Check class="icon-xs" />
            </div>
          </div>

          <!-- Liste over spor -->
          <div v-if="filteredTracks.length > 0" class="tracks-scroll">
            <div
              v-for="track in filteredTracks"
              :key="track.id"
              class="track-option"
              :class="{ active: selectedTrackId === track.id }"
              role="button"
              tabindex="0"
              :aria-label="track.name"
              @click="selectTrack(track)"
              @dblclick="selectAndConfirm(track)"
              @keydown.enter="selectTrack(track)"
              @keydown.space.prevent="selectTrack(track)"
            >
              <div class="track-icon-wrapper">
                <Route class="track-icon" />
              </div>
              <div class="track-info">
                <span class="track-name">{{ track.name }}</span>
                <div class="track-meta-row">
                  <span class="meta-item">
                    <Calendar class="icon-xxs" />
                    {{ formatDate(track.startTime || track.createdAt) }}
                  </span>
                  <span class="meta-dot">•</span>
                  <span class="meta-item dist">{{ formatDistance(track.distanceMeters) }}</span>
                  <span v-if="track.durationMs > 0" class="meta-dot">•</span>
                  <span v-if="track.durationMs > 0" class="meta-item">
                    {{ formatDuration(track.durationMs) }}
                  </span>
                </div>
              </div>
              <div v-if="selectedTrackId === track.id" class="check-badge">
                <Check class="icon-xs" />
              </div>
            </div>
          </div>

          <div v-else-if="trackStore.savedTracks.length === 0" class="empty-state">
            <Route class="empty-icon" />
            <p>Du har ingen lagrede spor ennå.</p>
            <p class="empty-sub">Last opp en GPX-fil ovenfor for å koble et spor til denne innsjekkingen.</p>
          </div>

          <div v-else class="empty-state">
            <p>Ingen spor matcher «{{ searchQuery }}».</p>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <button
            type="button"
            class="btn-cancel"
            aria-label="Avbryt"
            @click="emit('close')"
          >
            Avbryt
          </button>
          <button
            type="button"
            class="btn-confirm"
            aria-label="Bruk valgt spor"
            @click="handleConfirm"
          >
            <Check class="icon-sm" />
            <span>{{ selectedTrack ? 'Koble til dette sporet' : 'Lagre uten spor' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 12000;
  background-color: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.modal-card {
  background-color: var(--color-background, #ffffff);
  color: var(--text-primary, #0f172a);
  border-radius: 1rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 32rem;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color, #e2e8f0);
}

:global(.dark) .modal-card {
  background-color: #1e293b;
  color: #f8fafc;
  border-color: #334155;
}

/* Header */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

:global(.dark) .modal-header {
  border-color: #334155;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.header-icon {
  width: 1.35rem;
  height: 1.35rem;
  color: var(--primary-color, #0284c7);
}

.header-title {
  font-size: 1.125rem;
  font-weight: 700;
  margin: 0;
}

.close-button {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.35rem;
  border-radius: 0.5rem;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s, color 0.15s;
}

.close-button:hover {
  background-color: #f1f5f9;
  color: #0f172a;
}

:global(.dark) .close-button:hover {
  background-color: #334155;
  color: #f8fafc;
}

/* Upload Section */
.upload-section {
  padding: 1rem 1.25rem 0.5rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.hidden-file-input {
  display: none;
}

.upload-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem 1rem;
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  color: #ffffff;
  border: none;
  border-radius: 0.625rem;
  font-weight: 600;
  font-size: 0.9375rem;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
}

.upload-btn:hover:not(:disabled) {
  opacity: 0.95;
  transform: translateY(-1px);
}

.upload-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.upload-hint {
  font-size: 0.75rem;
  color: #64748b;
  text-align: center;
}

:global(.dark) .upload-hint {
  color: #94a3b8;
}

/* Alerts */
.alert-box {
  margin: 0 1.25rem 0.5rem 1.25rem;
  padding: 0.625rem 0.875rem;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.alert-box.error {
  background-color: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

:global(.dark) .alert-box.error {
  background-color: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.3);
}

.alert-box.success {
  background-color: #f0fdf4;
  color: #15803d;
  border: 1px solid #bbf7d0;
}

:global(.dark) .alert-box.success {
  background-color: rgba(34, 197, 94, 0.15);
  color: #86efac;
  border-color: rgba(34, 197, 94, 0.3);
}

.alert-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}

/* Track List */
.tracks-list-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 0.5rem 1.25rem 1rem 1.25rem;
}

.tracks-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  gap: 0.5rem;
}

.section-label {
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

:global(.dark) .section-label {
  color: #94a3b8;
}

.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 0.5rem;
  width: 0.875rem;
  height: 0.875rem;
  color: #94a3b8;
  pointer-events: none;
}

.search-input {
  padding: 0.35rem 0.5rem 0.35rem 1.75rem;
  font-size: 0.8125rem;
  border-radius: 0.375rem;
  border: 1px solid var(--border-color, #e2e8f0);
  background-color: #f8fafc;
  color: inherit;
  outline: none;
}

:global(.dark) .search-input {
  background-color: #0f172a;
  border-color: #334155;
}

.tracks-scroll {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-right: 0.25rem;
  max-height: 18rem;
}

.track-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 0.625rem;
  border: 1.5px solid var(--border-color, #e2e8f0);
  background-color: #f8fafc;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

:global(.dark) .track-option {
  background-color: #0f172a;
  border-color: #334155;
}

.track-option:hover {
  border-color: var(--primary-color, #0284c7);
  background-color: #f0f9ff;
}

:global(.dark) .track-option:hover {
  background-color: #1e3a5f;
  border-color: #38bdf8;
}

.track-option.active {
  border-color: var(--primary-color, #0284c7);
  background-color: #e0f2fe;
}

:global(.dark) .track-option.active {
  background-color: #0c4a6e;
  border-color: #38bdf8;
}

.track-option.none-option {
  margin-bottom: 0.5rem;
}

.track-icon-wrapper {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.5rem;
  background-color: #e0f2fe;
  color: #0284c7;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

:global(.dark) .track-icon-wrapper {
  background-color: #0369a1;
  color: #e0f2fe;
}

.track-icon {
  width: 1.25rem;
  height: 1.25rem;
}

.track-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.track-name {
  font-size: 0.9375rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-meta {
  font-size: 0.75rem;
  color: #64748b;
}

:global(.dark) .track-meta {
  color: #94a3b8;
}

.track-meta-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 0.15rem;
}

:global(.dark) .track-meta-row {
  color: #94a3b8;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.meta-item.dist {
  font-weight: 600;
  color: var(--primary-color, #0284c7);
}

:global(.dark) .meta-item.dist {
  color: #38bdf8;
}

.meta-dot {
  font-size: 0.6rem;
  color: #94a3b8;
}

.check-badge {
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 9999px;
  background-color: var(--primary-color, #0284c7);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* Empty state */
.empty-state {
  padding: 1.5rem 1rem;
  text-align: center;
  color: #64748b;
  font-size: 0.875rem;
}

:global(.dark) .empty-state {
  color: #94a3b8;
}

.empty-icon {
  width: 2.5rem;
  height: 2.5rem;
  margin: 0 auto 0.5rem auto;
  opacity: 0.4;
}

.empty-sub {
  font-size: 0.75rem;
  margin-top: 0.25rem;
}

/* Footer */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border-color, #e2e8f0);
  background-color: #f8fafc;
}

:global(.dark) .modal-footer {
  background-color: #0f172a;
  border-color: #334155;
}

.btn-cancel {
  padding: 0.625rem 1rem;
  border: 1px solid var(--border-color, #cbd5e1);
  background: transparent;
  color: inherit;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s;
}

.btn-cancel:hover {
  background-color: #e2e8f0;
}

:global(.dark) .btn-cancel:hover {
  background-color: #1e293b;
}

.btn-confirm {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.625rem 1.125rem;
  border: none;
  background: var(--primary-color, #0284c7);
  color: #ffffff;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-confirm:hover {
  opacity: 0.9;
}

/* Icons */
.icon-xxs {
  width: 0.75rem;
  height: 0.75rem;
}

.icon-xs {
  width: 0.875rem;
  height: 0.875rem;
}

.icon-sm {
  width: 1.1rem;
  height: 1.1rem;
}

.icon-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
