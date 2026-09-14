<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Mountain, Camera, X, Check, Loader2, AlertCircle, Image as ImageIcon, Route } from 'lucide-vue-next'
import type { TurpostItem } from '@/composables/useTurposter'
import { useAuth, type GoogleUser, type CheckinResult } from '@/composables/useAuth'
import { usePrivateTurposter } from '@/composables/usePrivateTurposter'
import { useFriends, type CheckinVisibility } from '@/composables/useFriends'
import { compressImage } from '@/utils/imageCompression'
import { useGpsTrackStore, type SavedTrack } from '@/stores/gpsTrack'
import WebcamCapture from '@/components/checkin/WebcamCapture.vue'
import CheckinVisibilitySelector from '@/components/checkin/CheckinVisibilitySelector.vue'
import TrackPickerModal from '@/components/TrackPickerModal.vue'
import {
  type GeoLocationState,
  calculateDistanceMeters,
  formatDistance,
  MAX_CHECKIN_DISTANCE_METERS
} from '@/composables/useGeolocation'

const props = defineProps<{
  isOpen: boolean
  turpost: TurpostItem | null
  user: GoogleUser | null
  userLocation?: GeoLocationState | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submitted', result: CheckinResult): void
}>()

const { submitCheckin } = useAuth()
const { submitPrivateCheckin } = usePrivateTurposter()
const { defaultVisibility, setCheckinVisibility } = useFriends()

const description = ref('')
const selectedFile = ref<File | null>(null)
const previewUrl = ref<string | null>(null)
const isSubmitting = ref(false)
const errorMessage = ref<string | null>(null)
const isSuccess = ref(false)
const selectedVisibility = ref<CheckinVisibility>('all')
const trackStore = useGpsTrackStore()
const selectedTrackId = ref<string | null>(null)
const isTrackPickerOpen = ref(false)

const attachedTrack = computed<SavedTrack | null>(() => {
  if (!selectedTrackId.value) return null
  return trackStore.savedTracks.find((t) => t.id === selectedTrackId.value) || null
})

function handleTrackSelected(track: SavedTrack | null) {
  selectedTrackId.value = track ? track.id : null
}

function removeTrack() {
  selectedTrackId.value = null
}

const cameraInputRef = ref<HTMLInputElement | null>(null)
const galleryInputRef = ref<HTMLInputElement | null>(null)
const isWebcamActive = ref(false)
const isProcessingImage = ref(false)

// Sjekk om enheten er mobil eller nettbrett (for å åpne native kamera vs webkamera)
const isMobileDevice = computed(() => {
  if (typeof navigator === 'undefined') return false
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (Boolean(navigator.maxTouchPoints && navigator.maxTouchPoints > 2) && /Macintosh/i.test(navigator.userAgent))
  )
})

// Avstandsberegning til turposten
const distance = computed(() => {
  if (!props.userLocation || !props.turpost) return null
  return calculateDistanceMeters(
    props.userLocation.lat,
    props.userLocation.lng,
    props.turpost.lat,
    props.turpost.lng
  )
})

const isWithinRange = computed(() => {
  return distance.value !== null && distance.value <= MAX_CHECKIN_DISTANCE_METERS
})

// Tilbakestill tilstand når modalen åpnes/lukkes
watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      description.value = ''
      clearFile()
      errorMessage.value = null
      isSuccess.value = false
      if (props.turpost?.isPrivate) {
        selectedVisibility.value = 'private'
      } else {
        selectedVisibility.value = defaultVisibility.value || 'all'
      }
      selectedTrackId.value = null
      isTrackPickerOpen.value = false
    } else {
      isWebcamActive.value = false
    }
  }
)

const handleTakePhoto = () => {
  errorMessage.value = null
  if (isMobileDevice.value) {
    cameraInputRef.value?.click()
  } else {
    isWebcamActive.value = true
  }
}

const handleFileInputChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  processAndSetImage(file)
}

async function processAndSetImage(file: File) {
  // Valider at det er et bilde
  if (!file.type.startsWith('image/')) {
    errorMessage.value = 'Vennligst velg en gyldig bildefil (JPEG, PNG, WebP).'
    return
  }

  // Maksimal størrelse før klientkomprimering: 25MB
  if (file.size > 25 * 1024 * 1024) {
    errorMessage.value = 'Bildet er for stort (maks 25 MB).'
    return
  }

  errorMessage.value = null
  isProcessingImage.value = true

  try {
    const compressed = await compressImage(file)
    if (previewUrl.value) {
      URL.revokeObjectURL(previewUrl.value)
    }
    selectedFile.value = compressed
    previewUrl.value = URL.createObjectURL(compressed)
  } catch (err: unknown) {
    console.warn('Bildeoptimalisering feilet, bruker original:', err)
    if (previewUrl.value) {
      URL.revokeObjectURL(previewUrl.value)
    }
    selectedFile.value = file
    previewUrl.value = URL.createObjectURL(file)
  } finally {
    isProcessingImage.value = false
  }
}

const clearFile = () => {
  isWebcamActive.value = false
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
  selectedFile.value = null
  previewUrl.value = null
  if (galleryInputRef.value) {
    galleryInputRef.value.value = ''
  }
  if (cameraInputRef.value) {
    cameraInputRef.value.value = ''
  }
}

const handleSubmit = async () => {
  if (!props.turpost || !props.user || isSubmitting.value || isProcessingImage.value) return

  if (!isWithinRange.value) {
    errorMessage.value = `Du må være innen 100 meter fra turposten for å sjekke inn (${distance.value !== null ? 'nåværende avstand: ' + formatDistance(distance.value) : 'posisjon ikke tilgjengelig'}).`
    return
  }

  isSubmitting.value = true
  errorMessage.value = null

  try {
    const fileToUpload = selectedFile.value

    let result: CheckinResult
    if (props.turpost.isPrivate) {
      if (!props.user) {
        throw new Error('Du må være innlogget for å sjekke inn på en privat turpost.')
      }
      result = await submitPrivateCheckin({
        userId: props.user.userId,
        userName: props.user.userName,
        userEmail: props.user.email,
        post: props.turpost,
        description: description.value.trim(),
        imageFile: fileToUpload,
        visibility: selectedVisibility.value,
        trackId: selectedTrackId.value || undefined
      })
    } else {
      result = await submitCheckin({
        turpostId: props.turpost.id,
        turpostName: props.turpost.name,
        description: description.value.trim(),
        imageFile: fileToUpload,
        trackId: selectedTrackId.value || undefined
      })
      if (result.id) {
        await setCheckinVisibility(result.id, selectedVisibility.value, {
          turpostId: String(props.turpost.id),
          userId: props.user?.userId
        })
      }
    }

    result.visibility = selectedVisibility.value
    isSuccess.value = true
    emit('submitted', result)

    // Automatisk lukking etter kort pause
    setTimeout(() => {
      if (props.isOpen) {
        emit('close')
      }
    }, 1800)
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'Kunne ikke fullføre innsjekkingen. Prøv igjen.'
  } finally {
    isSubmitting.value = false
  }
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.isOpen && !isSubmitting.value && !isTrackPickerOpen.value) {
    isWebcamActive.value = false
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  isWebcamActive.value = false
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="checkin-fade">
      <div v-if="isOpen" class="checkin-overlay" @click.self="!isSubmitting && !isTrackPickerOpen && emit('close')">
        <div class="checkin-card glass-panel" role="dialog" aria-modal="true">
          <!-- Header -->
          <div class="checkin-header">
            <div class="header-left">
              <div class="post-icon-badge">
                <Mountain :size="20" class="mountain-icon" />
              </div>
              <div class="header-text">
                <h3 class="post-title">{{ turpost?.name || 'Turpost' }}</h3>
                <div class="post-meta">
                  <span v-if="turpost?.alt" class="meta-alt">⛰️ {{ turpost.alt }} moh.</span>
                  <span v-if="turpost?.lat && turpost?.lng" class="meta-coords">
                    {{ turpost.lat.toFixed(4) }}°, {{ turpost.lng.toFixed(4) }}°
                  </span>
                </div>
                <!-- Avstand til turposten -->
                <div
                  class="checkin-range-banner"
                  :class="{
                    'in-range': isWithinRange,
                    'out-of-range': distance !== null && !isWithinRange,
                    'no-location': distance === null
                  }"
                >
                  <span v-if="isWithinRange">📍 Innen rekkevidde ({{ Math.round(distance!) }} m fra turposten)</span>
                  <span v-else-if="distance !== null">⚠️ For langt unna ({{ formatDistance(distance) }}). Må være under 100m.</span>
                  <span v-else>⚠️ Posisjon ikke tilgjengelig (maks 100m kreves).</span>
                </div>
              </div>
            </div>
            <button
              class="btn-close"
              :disabled="isSubmitting"
              @click="emit('close')"
              title="Lukk (Esc)"
              aria-label="Lukk"
            >
              <X :size="18" />
            </button>
          </div>

          <!-- Suksess-tilstand -->
          <div v-if="isSuccess" class="success-state">
            <div class="success-icon-wrap">
              <Check :size="36" />
            </div>
            <h4>Innsjekking fullført!</h4>
            <p>Du er nå registrert på {{ turpost?.name }}. God tur videre!</p>
          </div>

          <!-- Skjema -->
          <form v-else class="checkin-form" @submit.prevent="handleSubmit">
            <!-- Innlogget bruker tag -->
            <div class="user-strip">
              <img
                v-if="user?.avatarUrl"
                :src="user.avatarUrl"
                :alt="user.userName"
                class="user-avatar"
              />
              <div class="user-info">
                <span class="user-name">{{ user?.userName || 'Innlogget bruker' }}</span>
                <span class="user-status">Sjekker inn nå</span>
              </div>
            </div>

            <!-- Tekstnotat -->
            <div class="form-group">
              <label for="checkin-desc">Beskrivelse / Notat fra turen:</label>
              <textarea
                id="checkin-desc"
                v-model="description"
                rows="3"
                placeholder="Hvordan var turen? Føre, vær, opplevelse..."
                maxlength="500"
                class="desc-input"
                :disabled="isSubmitting"
              ></textarea>
              <div class="char-count">{{ description.length }}/500</div>
            </div>

            <!-- Bildeopplasting -->
            <div class="form-group">
              <label>Bilde fra turposten (valgfritt):</label>
              
              <!-- Forhåndsvisning -->
              <div v-if="previewUrl" class="image-preview-wrap">
                <img :src="previewUrl" alt="Forhåndsvisning av bilde" class="preview-img" />
                <button
                  type="button"
                  class="btn-remove-img"
                  :disabled="isSubmitting"
                  @click="clearFile"
                  title="Fjern bilde"
                >
                  <X :size="16" />
                </button>
              </div>

              <!-- Behandler bilde spinner -->
              <div v-else-if="isProcessingImage" class="image-processing-box">
                <Loader2 class="spinner processing-spinner" :size="22" />
                <span>Optimaliserer bilde...</span>
              </div>

              <!-- Webkamera live visning (PC/Mac) -->
              <WebcamCapture
                v-else-if="isWebcamActive"
                @photo="(file) => { isWebcamActive = false; processAndSetImage(file) }"
                @close="isWebcamActive = false"
                @error="(msg) => { isWebcamActive = false; errorMessage = msg }"
              />

              <!-- Valg mellom å ta nytt bilde eller velge eksisterende bilde -->
              <div v-else class="photo-choice-grid">
                <button
                  type="button"
                  class="photo-choice-btn"
                  :disabled="isSubmitting"
                  @click="handleTakePhoto"
                >
                  <div class="photo-choice-icon camera">
                    <Camera :size="20" />
                  </div>
                  <div class="photo-choice-text">
                    <strong>Ta bilde</strong>
                    <span>{{ isMobileDevice ? 'Bruk kamera' : 'Webkamera' }}</span>
                  </div>
                </button>

                <button
                  type="button"
                  class="photo-choice-btn"
                  :disabled="isSubmitting"
                  @click="galleryInputRef?.click()"
                >
                  <div class="photo-choice-icon gallery">
                    <ImageIcon :size="20" />
                  </div>
                  <div class="photo-choice-text">
                    <strong>Velg bilde</strong>
                    <span>{{ isMobileDevice ? 'Fra galleri' : 'Fra filer' }}</span>
                  </div>
                </button>
              </div>

              <!-- Skjulte fil-innganger (én med capture for direkte kamera på mobil, én uten for galleri/filer) -->
              <input
                ref="cameraInputRef"
                type="file"
                accept="image/*"
                capture="environment"
                class="hidden-file-input"
                @change="handleFileInputChange"
              />
              <input
                ref="galleryInputRef"
                type="file"
                accept="image/*"
                class="hidden-file-input"
                @change="handleFileInputChange"
              />
            </div>

            <!-- GPS-spor -->
            <div class="form-group">
              <label>Tilknyttet GPS-spor (valgfritt):</label>

              <div v-if="selectedTrackId" class="attached-track-card">
                <div class="track-card-left">
                  <div class="track-badge-icon">
                    <Route :size="18" />
                  </div>
                  <div class="track-badge-info">
                    <span class="track-badge-title">{{ attachedTrack?.name || 'GPS-spor' }}</span>
                    <span v-if="attachedTrack" class="track-badge-dist">
                      {{ formatDistance(attachedTrack.distanceMeters) }}
                    </span>
                    <span v-else class="track-badge-dist">Tilknyttet spor (ID: {{ selectedTrackId }})</span>
                  </div>
                </div>
                <div class="track-card-actions">
                  <button
                    type="button"
                    class="btn-track-action"
                    title="Endre spor"
                    aria-label="Endre spor"
                    @click="isTrackPickerOpen = true"
                  >
                    Bytt
                  </button>
                  <button
                    type="button"
                    class="btn-track-action remove"
                    title="Fjern tilknyttet spor"
                    aria-label="Fjern spor"
                    @click="removeTrack"
                  >
                    <X :size="14" />
                  </button>
                </div>
              </div>

              <button
                v-else
                type="button"
                class="btn-add-track"
                aria-label="Koble til eller last opp GPS-spor"
                @click="isTrackPickerOpen = true"
              >
                <Route :size="16" />
                <span>Koble til eller last opp GPS-spor</span>
              </button>
            </div>

            <!-- Synlighetsvalg -->
            <CheckinVisibilitySelector
              v-model="selectedVisibility"
              :disabled="isSubmitting"
            />

            <!-- Feilmelding -->
            <div v-if="errorMessage" class="error-box">
              <AlertCircle :size="18" class="error-icon" />
              <span>{{ errorMessage }}</span>
            </div>

            <!-- Knapper -->
            <div class="checkin-actions">
              <button
                type="button"
                class="btn-cancel"
                :disabled="isSubmitting"
                @click="emit('close')"
              >
                Avbryt
              </button>
              <button
                type="submit"
                class="btn-submit"
                :disabled="isSubmitting || !isWithinRange"
                :title="!isWithinRange ? 'Du må være innen 100 meter fra turposten for å sjekke inn' : 'Fullfør innsjekking'"
              >
                <Loader2 v-if="isSubmitting" class="spinner" :size="18" />
                <Check v-else :size="18" />
                <span>{{ isSubmitting ? 'Lagrer innsjekk...' : (isWithinRange ? 'Sjekk inn her' : 'For langt unna (maks 100m)') }}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>

    <TrackPickerModal
      :is-open="isTrackPickerOpen"
      :current-track-id="selectedTrackId"
      @close="isTrackPickerOpen = false"
      @select="handleTrackSelected"
    />
  </Teleport>
</template>

<style scoped>
.checkin-overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  padding: 16px;
  box-sizing: border-box;
}

.checkin-card {
  width: 100%;
  max-width: 480px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 18px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.05);
  padding: 20px;
  color: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Header */
.checkin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.post-icon-badge {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #0284c7, #2563eb);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4);
}

.header-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.post-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.post-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #94a3b8;
}

.meta-alt {
  color: #38bdf8;
  font-weight: 600;
}

.checkin-range-banner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
  width: fit-content;
}

.checkin-range-banner.in-range {
  background: rgba(34, 197, 94, 0.15);
  color: #86efac;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.checkin-range-banner.out-of-range {
  background: rgba(245, 158, 11, 0.15);
  color: #fcd34d;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.checkin-range-banner.no-location {
  background: rgba(148, 163, 184, 0.15);
  color: #cbd5e1;
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.btn-close {
  background: rgba(255, 255, 255, 0.08);
  border: none;
  color: #94a3b8;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.btn-close:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
}

/* User strip */
.user-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.04);
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.user-info {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: #f8fafc;
}

.user-status {
  font-size: 11px;
  color: #38bdf8;
}

/* Form */
.checkin-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 12px;
  font-weight: 600;
  color: #cbd5e1;
}

.desc-input {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  padding: 10px 12px;
  color: #f8fafc;
  font-family: inherit;
  font-size: 14px;
  resize: vertical;
  min-height: 70px;
  transition: border-color 0.2s ease;
}

.desc-input:focus {
  outline: none;
  border-color: #38bdf8;
  background: rgba(255, 255, 255, 0.08);
}

.char-count {
  font-size: 10px;
  color: #64748b;
  text-align: right;
}

/* Bildeopplasting */
.hidden-file-input {
  display: none;
}

.photo-choice-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.photo-choice-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
  color: #f8fafc;
}

.photo-choice-btn:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.08);
  border-color: #38bdf8;
  transform: translateY(-1px);
}

.photo-choice-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.photo-choice-icon {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.photo-choice-icon.camera {
  background: rgba(14, 165, 233, 0.18);
  color: #38bdf8;
  border: 1px solid rgba(14, 165, 233, 0.35);
}

.photo-choice-icon.gallery {
  background: rgba(168, 85, 247, 0.18);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.35);
}

.photo-choice-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.photo-choice-text strong {
  font-size: 13px;
  font-weight: 600;
  color: #f8fafc;
  line-height: 1.2;
}

.photo-choice-text span {
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.3;
  margin-top: 2px;
}

/* Image processing */
.image-processing-box {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px 16px;
  background: rgba(56, 189, 248, 0.05);
  border: 1px dashed rgba(56, 189, 248, 0.4);
  border-radius: 12px;
  color: #38bdf8;
  font-size: 13px;
  font-weight: 600;
}

.processing-spinner {
  animation: spin 1s linear infinite;
}



/* Image preview */
.image-preview-wrap {
  position: relative;
  width: 100%;
  max-height: 200px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.preview-img {
  width: 100%;
  max-height: 200px;
  object-fit: cover;
  display: block;
}

.btn-remove-img {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  border: none;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-remove-img:hover {
  background: #ef4444;
}



/* Error box */
.error-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 10px;
  color: #fca5a5;
  font-size: 13px;
}

.error-icon {
  flex-shrink: 0;
}

/* Actions */
.checkin-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
}

.btn-cancel {
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: #cbd5e1;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-cancel:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.btn-submit {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #0284c7, #2563eb);
  border: 1px solid #38bdf8;
  border-radius: 10px;
  color: #ffffff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(2, 132, 199, 0.4);
  transition: all 0.2s ease;
}

.btn-submit:hover:not(:disabled) {
  background: linear-gradient(135deg, #0369a1, #1d4ed8);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(2, 132, 199, 0.5);
}

.btn-submit:disabled {
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

/* Suksessvisning */
.success-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 30px 20px;
  gap: 12px;
}

.success-icon-wrap {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981, #059669);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.45);
  animation: pop-bounce 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes pop-bounce {
  0% { transform: scale(0.5); opacity: 0; }
  70% { transform: scale(1.15); }
  100% { transform: scale(1); opacity: 1; }
}

.success-state h4 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #f8fafc;
}

.success-state p {
  margin: 0;
  font-size: 14px;
  color: #94a3b8;
}

/* Transisjoner */
.checkin-fade-enter-active,
.checkin-fade-leave-active {
  transition: opacity 0.25s ease;
}

.checkin-fade-enter-from,
.checkin-fade-leave-to {
  opacity: 0;
}

.checkin-fade-enter-active .checkin-card,
.checkin-fade-leave-active .checkin-card {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.checkin-fade-enter-from .checkin-card,
.checkin-fade-leave-to .checkin-card {
  transform: translateY(12px) scale(0.97);
}

/* GPS Track Styles */
.attached-track-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: rgba(2, 132, 199, 0.08);
  border: 1px solid rgba(2, 132, 199, 0.25);
  border-radius: 12px;
}

.track-card-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.track-badge-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(2, 132, 199, 0.18);
  color: #38bdf8;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.track-badge-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.track-badge-title {
  font-size: 13px;
  font-weight: 600;
  color: #f1f5f9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-badge-dist {
  font-size: 11px;
  color: #94a3b8;
}

.track-card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.btn-track-action {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-track-action:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.btn-track-action.remove {
  padding: 4px 6px;
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.25);
}

.btn-track-action.remove:hover {
  background: rgba(248, 113, 113, 0.15);
}

.btn-add-track {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1.5px dashed rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-add-track:hover {
  background: rgba(2, 132, 199, 0.08);
  border-color: #0284c7;
  color: #38bdf8;
}
</style>
