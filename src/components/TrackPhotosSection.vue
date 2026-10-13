<script setup lang="ts">
import { ref, computed, onMounted, useTemplateRef } from 'vue'
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Upload,
  Image as ImageIcon,
  ExternalLink,
  Trash2,
  Loader2,
  MapPin,
  AlertCircle,
  X,
  Users
} from 'lucide-vue-next'
import { useGpsTrackStore, type SavedTrack } from '@/stores/gpsTrack'
import { formatTrackKey } from '@/composables/useFirebaseTracks'
import {
  useTrackPhotos,
  type TrackPhoto,
  isFileWithinTrackTime
} from '@/composables/useTrackPhotos'

const props = defineProps<{
  track: SavedTrack
  userId: string
}>()

const {
  isDriveAuthorized,
  isAuthorizingDrive,
  requestDriveAccess,
  getOrCreateTorturFolder,
  getOrCreateTrackFolder,
  fetchTrackPhotos,
  deleteTrackPhoto,
  uploadSingleTrackPhoto
} = useTrackPhotos()

const isOpen = ref(false)
const photos = ref<TrackPhoto[]>([])
const isLoading = ref(false)
const isUploading = ref(false)
const uploadStatusText = ref('')
const uploadError = ref<string | null>(null)
const selectedPhotoForModal = ref<TrackPhoto | null>(null)
const hasLoadedOnce = ref(false)

const fileInputRef = useTemplateRef<HTMLInputElement>('fileInput')

const trackKey = computed(() => {
  return props.track.firebaseKey || formatTrackKey(props.track.startTime || props.track.createdAt)
})

const trackStore = useGpsTrackStore()
const isPhotosSharedWithFriends = computed(() => !!props.track.sharePhotosWithFriends)

function handleToggleSharePhotos(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked
  trackStore.setPhotoSharing(props.track.id, checked)
}

const photoCount = computed(() => photos.value.length)

// Tidsvisning for turen
const trackTimeRangeText = computed(() => {
  const start = props.track.startTime || props.track.createdAt
  if (!start) return ''
  const startDate = new Date(start)
  const startTimeStr = startDate.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })

  if (props.track.endTime) {
    const endDate = new Date(props.track.endTime)
    const endTimeStr = endDate.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })
    return `Turen varte fra ${startTimeStr} til ${endTimeStr}`
  } else if (props.track.durationMs && props.track.durationMs > 0) {
    const endDate = new Date(start + props.track.durationMs)
    const endTimeStr = endDate.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })
    return `Turen varte fra ca. ${startTimeStr} til ${endTimeStr}`
  }
  return `Startet ${startTimeStr}`
})

async function loadPhotos(): Promise<void> {
  if (!props.userId || props.userId === 'guest') return
  isLoading.value = true
  try {
    const fetched = await fetchTrackPhotos(props.userId, trackKey.value)
    photos.value = fetched
    hasLoadedOnce.value = true
  } catch (err) {
    console.warn('[TrackPhotosSection] Kunne ikke laste turbilder:', err)
  } finally {
    isLoading.value = false
  }
}

async function toggleOpen(): Promise<void> {
  isOpen.value = !isOpen.value
  if (isOpen.value && !hasLoadedOnce.value) {
    await loadPhotos()
  }
}

async function handleConnectDrive(): Promise<void> {
  uploadError.value = null
  try {
    await requestDriveAccess()
  } catch (err) {
    uploadError.value = err instanceof Error ? err.message : 'Kunne ikke koble til Google Drive'
  }
}

async function handleChooseFiles(): Promise<void> {
  uploadError.value = null
  if (!isDriveAuthorized.value) {
    try {
      await requestDriveAccess()
    } catch (err) {
      uploadError.value = err instanceof Error ? err.message : 'Google Drive-innlogging feilet'
      return
    }
  }
  fileInputRef.value?.click()
}

async function onFilesSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return

  const allFiles = Array.from(input.files)
  input.value = '' // Nullstill så samme filer kan velges på nytt om ønskelig

  uploadError.value = null
  isUploading.value = true

  try {
    const accessToken = await requestDriveAccess()
    const rootFolderId = await getOrCreateTorturFolder(accessToken)
    const folderId = await getOrCreateTrackFolder(rootFolderId, props.track, accessToken)

    // Filtrer filer basert på turens start- og sluttid
    const trackStart = props.track.startTime || props.track.createdAt
    const trackEnd = props.track.endTime || (props.track.durationMs ? trackStart + props.track.durationMs : trackStart)

    let filesToUpload = allFiles
    if (trackStart && trackEnd) {
      const matchingFiles = allFiles.filter((f) =>
        isFileWithinTrackTime(f.lastModified, trackStart, trackEnd, 30 * 60 * 1000)
      )

      // Hvis bare noen av filene matcher, bruk de som matcher eller gi brukeren et hint
      if (matchingFiles.length > 0 && matchingFiles.length < allFiles.length) {
        filesToUpload = matchingFiles
      }
    }

    const total = filesToUpload.length
    for (let i = 0; i < total; i++) {
      const file = filesToUpload[i]
      if (!file) continue
      uploadStatusText.value = `Laster opp ${i + 1} av ${total}: ${file.name}...`

      const uploadedPhoto = await uploadSingleTrackPhoto(
        file,
        props.track,
        props.userId,
        folderId,
        accessToken
      )

      if (uploadedPhoto) {
        // Legg til lokalt i listen
        photos.value.push(uploadedPhoto)
        // Sorter kronologisk
        photos.value.sort(
          (a, b) => (a.exifTimestamp || a.uploadedAt) - (b.exifTimestamp || b.uploadedAt)
        )
      }
    }
  } catch (err) {
    uploadError.value = err instanceof Error ? err.message : 'Feil under opplasting av bilder'
  } finally {
    isUploading.value = false
    uploadStatusText.value = ''
  }
}

async function handleDelete(photo: TrackPhoto): Promise<void> {
  if (!isDriveAuthorized.value) return

  if (!confirm(`Vil du fjerne bildet «${photo.filename}» fra turen og slette det fra Google Drive?`)) return

  const ok = await deleteTrackPhoto(props.userId, trackKey.value, photo)
  if (ok) {
    photos.value = photos.value.filter((p) => p.id !== photo.id && p.fileId !== photo.fileId)
    if (selectedPhotoForModal.value?.fileId === photo.fileId) {
      selectedPhotoForModal.value = null
    }
  } else {
    alert('Kunne ikke slette bildet fra Google Drive og databasen. Sjekk Google Drive-tilkoblingen og prøv igjen.')
  }
}

function openLightbox(photo: TrackPhoto): void {
  selectedPhotoForModal.value = photo
}

function closeLightbox(): void {
  selectedPhotoForModal.value = null
}

function formatPhotoTime(ts?: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  // Last gjerne inn bildetallet stille hvis brukeren allerede er innlogget
  if (props.userId && props.userId !== 'guest') {
    loadPhotos()
  }
})
</script>

<template>
  <div class="track-photos-section">
    <!-- Skjult filvelger -->
    <input
      ref="fileInput"
      type="file"
      multiple
      accept="image/*"
      class="hidden-file-input"
      @change="onFilesSelected"
    />

    <!-- Seksjonstittel / Trekkspill-knapp -->
    <button
      class="btn-photos-accordion"
      :class="{ 'is-open': isOpen }"
      @click="toggleOpen"
      :aria-expanded="isOpen"
      aria-label="Åpne eller lukk turbilder for sporet"
    >
      <div class="accordion-left">
        <Camera :size="14" class="photos-icon" />
        <span class="photos-title">Turbilder</span>
        <span v-if="photoCount > 0" class="badge-photo-count">{{ photoCount }}</span>
      </div>
      <div class="accordion-right">
        <Loader2 v-if="isLoading" :size="13" class="spin-icon" />
        <ChevronUp v-else-if="isOpen" :size="14" />
        <ChevronDown v-else-if="!isOpen" :size="14" />
      </div>
    </button>

    <!-- Innhold (når åpen) -->
    <div v-if="isOpen" class="photos-panel-body">
      <!-- Tidspunkt-info -->
      <div v-if="trackTimeRangeText" class="time-range-hint">
        {{ trackTimeRangeText }}
      </div>

      <!-- Feilmelding ved opplasting -->
      <div v-if="uploadError" class="alert-error-box">
        <AlertCircle :size="14" />
        <span>{{ uploadError }}</span>
      </div>

      <!-- Fremdriftslinje for opplasting -->
      <div v-if="isUploading" class="uploading-progress-box">
        <Loader2 :size="16" class="spin-icon text-primary" />
        <span class="upload-progress-text">{{ uploadStatusText }}</span>
      </div>

      <!-- Handlingsrad for opplasting -->
      <div class="photos-actions-bar">
        <button
          v-if="!isDriveAuthorized"
          class="btn-drive-connect"
          :disabled="isAuthorizingDrive || isUploading"
          @click="handleConnectDrive"
          title="Koble til Google Drive for å lagre turbildene dine"
        >
          <Loader2 v-if="isAuthorizingDrive" :size="14" class="spin-icon" />
          <Upload v-else :size="14" />
          <span>Koble til Google Drive</span>
        </button>

        <button
          v-else
          class="btn-upload-photos"
          :disabled="isUploading"
          @click="handleChooseFiles"
          title="Velg bilder fra mobilen eller datamaskinen som er tatt på denne turen"
        >
          <Upload :size="14" />
          <span>Legg til bilder fra turen</span>
        </button>
      </div>

      <!-- Bryter for deling av bilder med venner -->
      <div class="photos-share-row">
        <div class="share-info">
          <Users :size="14" class="share-icon" />
          <div class="share-text-block">
            <span class="share-text">Del bilder med venner</span>
            <span class="share-subtext">Venner kan se bildene dine når de åpner dette sporet</span>
          </div>
        </div>
        <label class="switch-control">
          <input
            type="checkbox"
            :checked="isPhotosSharedWithFriends"
            @change="handleToggleSharePhotos"
            aria-label="Del turbilder med venner for dette sporet"
          />
          <span class="slider round"></span>
        </label>
      </div>

      <!-- Bildegalleri -->
      <div v-if="photos.length > 0" class="photo-grid">
        <div
          v-for="photo in photos"
          :key="photo.id || photo.fileId"
          class="photo-card"
        >
          <div class="photo-thumbnail-wrap" @click="openLightbox(photo)">
            <img
              :src="photo.thumbnailUrl || photo.thumbnailDataUrl || photo.url"
              :alt="photo.filename"
              loading="lazy"
              class="photo-thumbnail"
            />
            <!-- GPS- og tid-merker over bildet -->
            <div class="thumbnail-badges">
              <span v-if="photo.lat && photo.lng" class="badge-geo" title="Bilde har GPS-posisjon">
                <MapPin :size="10" />
              </span>
              <span v-if="photo.exifTimestamp" class="badge-time">
                {{ formatPhotoTime(photo.exifTimestamp) }}
              </span>
            </div>
          </div>

          <!-- Handlingsknapper per bilde -->
          <div class="photo-meta-bar">
            <a
              v-if="photo.driveViewUrl"
              :href="photo.driveViewUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="btn-photo-link"
              title="Åpne bilde i Google Drive"
            >
              <ExternalLink :size="12" />
            </a>
            <button
              v-if="isDriveAuthorized"
              class="btn-photo-delete"
              @click="handleDelete(photo)"
              title="Fjern bilde fra turen og Google Drive"
              aria-label="Slett bilde"
            >
              <Trash2 :size="12" />
            </button>
          </div>
        </div>
      </div>

      <!-- Tom tilstand når åpen og ingen bilder er lastet opp -->
      <div v-else-if="!isLoading && !isUploading" class="photos-empty-state">
        <ImageIcon :size="24" class="empty-photos-icon" />
        <p>Ingen bilder lagt til på dette sporet ennå.</p>
        <span class="empty-photos-subtext">
          Bildene lagres i din private Google Drive-mappe «TorTur» og kobles til dette sporet.
        </span>
      </div>
    </div>

    <!-- Modal / Lightbox for visning i full størrelse -->
    <div
      v-if="selectedPhotoForModal"
      class="lightbox-backdrop"
      @click.self="closeLightbox"
    >
      <div class="lightbox-content">
        <button class="btn-lightbox-close" @click="closeLightbox" aria-label="Lukk bildevisning">
          <X :size="20" />
        </button>

        <img
          :src="selectedPhotoForModal.url"
          :alt="selectedPhotoForModal.filename"
          class="lightbox-image"
          @error="(e) => {
            const target = e.target as HTMLImageElement
            const fallback = selectedPhotoForModal?.thumbnailUrl || selectedPhotoForModal?.thumbnailDataUrl
            if (fallback && target.src !== fallback) {
              target.src = fallback
            }
          }"
        />

        <div class="lightbox-footer">
          <span class="lightbox-filename">{{ selectedPhotoForModal.filename }}</span>
          <div class="lightbox-info">
            <span v-if="selectedPhotoForModal.exifTimestamp">
              Tatt: {{ new Date(selectedPhotoForModal.exifTimestamp).toLocaleString('no-NO') }}
            </span>
            <span v-if="selectedPhotoForModal.lat && selectedPhotoForModal.lng" class="geo-info">
              <MapPin :size="12" />
              {{ selectedPhotoForModal.lat.toFixed(5) }}, {{ selectedPhotoForModal.lng.toFixed(5) }}
            </span>
            <a
              v-if="selectedPhotoForModal.driveViewUrl"
              :href="selectedPhotoForModal.driveViewUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="lightbox-drive-link"
            >
              <ExternalLink :size="13" />
              Åpne i Google Drive
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.track-photos-section {
  margin-top: 8px;
  border-top: 1px solid rgba(51, 65, 85, 0.45);
  padding-top: 6px;
}

.hidden-file-input {
  display: none;
}

.btn-photos-accordion {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(30, 41, 59, 0.4);
  border: 1px solid rgba(51, 65, 85, 0.5);
  border-radius: 6px;
  padding: 6px 10px;
  color: #94a3b8;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-photos-accordion:hover {
  background: rgba(51, 65, 85, 0.6);
  color: #f1f5f9;
  border-color: rgba(100, 116, 139, 0.6);
}

.btn-photos-accordion.is-open {
  background: rgba(51, 65, 85, 0.5);
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.35);
}

.accordion-left {
  display: flex;
  align-items: center;
  gap: 7px;
}

.photos-icon {
  color: #38bdf8;
}

.badge-photo-count {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
}

.accordion-right {
  display: flex;
  align-items: center;
  color: #64748b;
}

.photos-panel-body {
  margin-top: 8px;
  padding: 8px 10px 10px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(51, 65, 85, 0.4);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.time-range-hint {
  font-size: 11.5px;
  color: #64748b;
  font-style: italic;
}

.alert-error-box {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
  font-size: 11.5px;
}

.uploading-progress-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.25);
  color: #e0f2fe;
  font-size: 12px;
}

.upload-progress-text {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.photos-actions-bar {
  display: flex;
  gap: 8px;
}

.photos-share-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  background: rgba(30, 41, 59, 0.45);
  border: 1px solid rgba(51, 65, 85, 0.4);
  border-radius: 6px;
  gap: 8px;
}

.share-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.share-icon {
  color: #38bdf8;
  flex-shrink: 0;
}

.share-text-block {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.share-text {
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
}

.share-subtext {
  font-size: 10.5px;
  color: #94a3b8;
}

.switch-control {
  position: relative;
  display: inline-block;
  width: 34px;
  height: 20px;
  flex-shrink: 0;
  cursor: pointer;
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

.btn-drive-connect,
.btn-upload-photos {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
}

.btn-drive-connect {
  background: #2563eb;
  color: #ffffff;
}

.btn-drive-connect:hover:not(:disabled) {
  background: #1d4ed8;
}

.btn-upload-photos {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.4);
}

.btn-upload-photos:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.3);
  color: #ffffff;
}

.btn-drive-connect:disabled,
.btn-upload-photos:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(75px, 1fr));
  gap: 8px;
  margin-top: 4px;
}

.photo-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(51, 65, 85, 0.6);
}

.photo-thumbnail-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  cursor: pointer;
  overflow: hidden;
}

.photo-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s ease;
}

.photo-thumbnail-wrap:hover .photo-thumbnail {
  transform: scale(1.05);
}

.thumbnail-badges {
  position: absolute;
  top: 4px;
  left: 4px;
  right: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  pointer-events: none;
}

.badge-geo {
  background: rgba(15, 23, 42, 0.75);
  color: #38bdf8;
  padding: 2px 4px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  font-size: 10px;
}

.badge-time {
  background: rgba(15, 23, 42, 0.75);
  color: #f1f5f9;
  font-size: 9.5px;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 500;
  margin-left: auto;
}

.photo-meta-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 6px;
  background: rgba(15, 23, 42, 0.9);
}

.btn-photo-link,
.btn-photo-delete {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  transition: color 0.15s ease;
}

.btn-photo-link:hover {
  color: #38bdf8;
}

.btn-photo-delete:hover {
  color: #f87171;
}

.photos-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 16px 8px;
  color: #64748b;
  gap: 4px;
}

.empty-photos-icon {
  color: #475569;
  margin-bottom: 2px;
}

.photos-empty-state p {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}

.empty-photos-subtext {
  font-size: 11px;
  color: #64748b;
  max-width: 260px;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Lightbox Modal */
.lightbox-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20000;
  background: rgba(10, 15, 25, 0.88);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.lightbox-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 20px 35px rgba(0, 0, 0, 0.6);
}

.btn-lightbox-close {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  color: #f1f5f9;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  transition: all 0.15s ease;
}

.btn-lightbox-close:hover {
  background: rgba(239, 68, 68, 0.8);
  color: #ffffff;
}

.lightbox-image {
  max-width: 85vw;
  max-height: 75vh;
  object-fit: contain;
  display: block;
}

.lightbox-footer {
  width: 100%;
  padding: 10px 14px;
  background: #0f172a;
  border-top: 1px solid #1e293b;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lightbox-filename {
  font-size: 13px;
  font-weight: 600;
  color: #f8fafc;
}

.lightbox-info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  font-size: 11.5px;
  color: #94a3b8;
}

.geo-info {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #38bdf8;
}

.lightbox-drive-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #38bdf8;
  text-decoration: none;
  margin-left: auto;
}

.lightbox-drive-link:hover {
  text-decoration: underline;
}
</style>
