<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  Mountain,
  Camera,
  X,
  Check,
  Loader2,
  AlertCircle,
  Image as ImageIcon,
  Trash2,
  Undo2,
} from 'lucide-vue-next'
import { useAuth, type FirebaseCheckinItem } from '@/composables/useAuth'
import { usePrivateTurposter } from '@/composables/usePrivateTurposter'
import type { CheckinVisibility } from '@/composables/useFriends'
import { compressImage } from '@/utils/imageCompression'
import WebcamCapture from '@/components/checkin/WebcamCapture.vue'
import CheckinVisibilitySelector from '@/components/checkin/CheckinVisibilitySelector.vue'

const props = defineProps<{
  isOpen: boolean
  checkin: FirebaseCheckinItem | null
  turpostName?: string
  isPrivate?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', updated: FirebaseCheckinItem): void
  (e: 'deleted', checkinId: string): void
}>()

const { user, updatePublicCheckin, deletePublicCheckin } = useAuth()
const { updatePrivateCheckin, deletePrivateCheckin } = usePrivateTurposter()

const description = ref('')
const originalImageUrl = ref('')
const selectedFile = ref<File | null>(null)
const selectedVisibility = ref<CheckinVisibility>('all')
const previewUrl = ref<string | null>(null)
const isImageRemoved = ref(false)
const isSubmitting = ref(false)
const isDeleting = ref(false)
const errorMessage = ref<string | null>(null)
const isSuccess = ref(false)

const cameraInputRef = ref<HTMLInputElement | null>(null)
const galleryInputRef = ref<HTMLInputElement | null>(null)
const isWebcamActive = ref(false)
const isProcessingImage = ref(false)

const isMobileDevice = computed(() => {
  if (typeof navigator === 'undefined') return false
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (Boolean(navigator.maxTouchPoints && navigator.maxTouchPoints > 2) &&
      /Macintosh/i.test(navigator.userAgent))
  )
})

// Aktivt bilde som skal forhåndsvises (nyopplastet preview, eller eksisterende bilde hvis ikke fjernet)
const currentDisplayImageUrl = computed(() => {
  if (previewUrl.value) return previewUrl.value
  if (!isImageRemoved.value && originalImageUrl.value) return originalImageUrl.value
  return null
})

// Tilbakestill tilstand ved åpning
watch(
  () => props.isOpen,
  (open) => {
    if (open && props.checkin) {
      description.value = props.checkin.description || ''
      originalImageUrl.value = props.checkin.imageUrl || ''
      selectedVisibility.value =
        props.checkin.visibility || (props.checkin.isPrivate || props.isPrivate ? 'private' : 'all')
      isImageRemoved.value = false
      clearSelectedFile()
      errorMessage.value = null
      isSuccess.value = false
      dragPosition.value = { x: 0, y: 0 }
    } else {
      isWebcamActive.value = false
    }
  },
  { immediate: true },
)

const handleTakePhoto = () => {
  errorMessage.value = null
  if (isMobileDevice.value) {
    cameraInputRef.value?.click()
  } else {
    isWebcamActive.value = true
  }
}

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    await processAndSetFile(file)
  }
}

async function processAndSetFile(file: File) {
  isProcessingImage.value = true
  errorMessage.value = null
  try {
    const compressed = await compressImage(file)
    setFile(compressed)
    isImageRemoved.value = false
  } catch (err: unknown) {
    console.warn('Kunne ikke komprimere bildet, bruker original:', err)
    setFile(file)
    isImageRemoved.value = false
  } finally {
    isProcessingImage.value = false
  }
}

const setFile = (file: File) => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
  selectedFile.value = file
  previewUrl.value = URL.createObjectURL(file)
}

const clearSelectedFile = () => {
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

const handleRemoveImage = () => {
  clearSelectedFile()
  isImageRemoved.value = true
}

const handleRestoreOriginalImage = () => {
  clearSelectedFile()
  isImageRemoved.value = false
}

// Lagre endringene
const handleSubmit = async () => {
  if (!props.checkin || isSubmitting.value || isProcessingImage.value) return

  isSubmitting.value = true
  errorMessage.value = null

  try {
    const newDescription = description.value.trim()
    let updatedImageUrl = props.checkin.imageUrl
    if (isImageRemoved.value && !selectedFile.value) {
      updatedImageUrl = ''
    }

    const isPriv = Boolean(props.isPrivate || props.checkin.isPrivate)

    if (isPriv) {
      if (!user.value) throw new Error('Du må være innlogget.')
      const res = await updatePrivateCheckin(
        user.value.userId,
        props.checkin.spotId || props.checkin.turpostId,
        props.checkin.id,
        {
          description: newDescription,
          imageFile: selectedFile.value,
          removeImage: isImageRemoved.value,
          visibility: selectedVisibility.value,
        },
      )
      if (res.imageUrl !== undefined) {
        updatedImageUrl = res.imageUrl
      }
    } else {
      const res = await updatePublicCheckin({
        turpostId: props.checkin.turpostId,
        checkinId: props.checkin.id,
        timestamp: props.checkin.timestamp,
        description: newDescription,
        imageFile: selectedFile.value,
        removeImage: isImageRemoved.value,
        visibility: selectedVisibility.value,
      })
      if (res.imageUrl !== undefined) {
        updatedImageUrl = res.imageUrl
      }
    }

    const updatedItem: FirebaseCheckinItem = {
      ...props.checkin,
      description: newDescription,
      imageUrl: updatedImageUrl,
      visibility: selectedVisibility.value,
    }

    isSuccess.value = true
    emit('saved', updatedItem)

    setTimeout(() => {
      if (props.isOpen) {
        emit('close')
      }
    }, 1200)
  } catch (err: unknown) {
    errorMessage.value =
      err instanceof Error ? err.message : 'Kunne ikke lagre endringene. Prøv igjen.'
  } finally {
    isSubmitting.value = false
  }
}

// Slett innsjekkingen permanent
async function handleDeleteCheckin() {
  if (!props.checkin || isSubmitting.value || isDeleting.value) return
  if (
    !confirm(
      'Er du sikker på at du vil slette denne innsjekkingen? Hvis den har et tilhørende bilde vil også bildet bli slettet.',
    )
  ) {
    return
  }

  isDeleting.value = true
  errorMessage.value = null
  try {
    const isPriv = Boolean(props.isPrivate || props.checkin.isPrivate)
    if (isPriv) {
      if (!user.value) throw new Error('Du må være innlogget.')
      await deletePrivateCheckin(
        user.value.userId,
        props.checkin.spotId || props.checkin.turpostId,
        props.checkin.id,
      )
    } else {
      await deletePublicCheckin({
        turpostId: props.checkin.turpostId,
        checkinId: props.checkin.id,
        timestamp: props.checkin.timestamp,
      })
    }
    emit('deleted', props.checkin.id)
    emit('close')
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'Kunne ikke slette innsjekkingen.'
  } finally {
    isDeleting.value = false
  }
}

// Dra/flytt logikk for modalen
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
    transform: `translate3d(${dragPosition.value.x}px, ${dragPosition.value.y}px, 0)`,
  }
})

const startDrag = (e: PointerEvent) => {
  if (e.button !== 0) return
  const target = e.target as HTMLElement | null
  if (
    target?.closest('button') ||
    target?.closest('a') ||
    target?.closest('input') ||
    target?.closest('textarea')
  ) {
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

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.isOpen && !isSubmitting.value) {
    isWebcamActive.value = false
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  isWebcamActive.value = false
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isOpen" class="modal-overlay" @click.self="!isSubmitting && emit('close')">
        <div
          ref="modalRef"
          class="edit-checkin-card glass-panel"
          :class="{ 'is-dragging': isDragging }"
          :style="modalStyle"
          role="dialog"
          aria-modal="true"
        >
          <!-- Header -->
          <div class="card-header" @pointerdown="startDrag" title="Klikk og dra for å flytte">
            <div class="header-left">
              <div class="post-badge">
                <Mountain :size="20" />
              </div>
              <div class="header-text">
                <h3 class="post-title">Rediger innsjekking</h3>
                <span class="post-subtitle">
                  {{
                    turpostName || checkin?.turpostName || 'Turpost ' + (checkin?.turpostId || '')
                  }}
                </span>
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

          <!-- Skjema -->
          <form @submit.prevent="handleSubmit" class="modal-body scrollable">
            <!-- Meldinger -->
            <div v-if="errorMessage" class="alert-box error" role="alert">
              <AlertCircle :size="16" class="alert-icon" />
              <span>{{ errorMessage }}</span>
            </div>

            <div v-if="isSuccess" class="alert-box success" role="status">
              <Check :size="16" class="alert-icon" />
              <span>Innsjekkingen ble oppdatert!</span>
            </div>

            <!-- Turbeskrivelse -->
            <div class="form-group">
              <label for="edit-checkin-desc" class="form-label">
                <span>Turbeskrivelse / notat</span>
                <span class="optional-tag">Valgfritt</span>
              </label>
              <textarea
                id="edit-checkin-desc"
                v-model="description"
                rows="3"
                class="form-textarea"
                placeholder="Hva opplevde du på turen?"
                maxlength="500"
                :disabled="isSubmitting"
              ></textarea>
              <div class="char-count">{{ description.length }}/500</div>
            </div>

            <!-- Bildehåndtering -->
            <div class="form-group">
              <div class="photo-header-row">
                <label class="form-label mb-0">Turbilde</label>
                <button
                  v-if="isImageRemoved && originalImageUrl"
                  type="button"
                  class="btn-restore-img"
                  @click="handleRestoreOriginalImage"
                  title="Angre fjerning av opprinnelig bilde"
                >
                  <Undo2 :size="12" />
                  <span>Gjenopprett opprinnelig bilde</span>
                </button>
              </div>

              <!-- Skjulte fil-inndata -->
              <input
                ref="cameraInputRef"
                type="file"
                accept="image/*"
                capture="environment"
                class="hidden-input"
                @change="handleFileChange"
              />
              <input
                ref="galleryInputRef"
                type="file"
                accept="image/*"
                class="hidden-input"
                @change="handleFileChange"
              />

              <!-- Webkamera søker -->
              <WebcamCapture
                v-if="isWebcamActive"
                @photo="(file) => { isWebcamActive = false; processAndSetFile(file) }"
                @close="isWebcamActive = false"
                @error="(msg) => { isWebcamActive = false; errorMessage = msg }"
              />

              <!-- Forhåndsvisning av bilde (eksisterende eller nyvalgt) -->
              <div v-else-if="currentDisplayImageUrl" class="photo-preview-box">
                <img :src="currentDisplayImageUrl" alt="Turbilde" class="preview-img" />
                <div class="photo-preview-bar">
                  <span class="preview-tag">
                    {{ selectedFile ? 'Nytt bilde valgt' : 'Nåværende bilde' }}
                  </span>
                  <div class="preview-actions">
                    <button
                      type="button"
                      class="btn-preview-action"
                      @click="galleryInputRef?.click()"
                      title="Velg et annet bilde"
                    >
                      <ImageIcon :size="13" />
                      <span>Erstatt</span>
                    </button>
                    <button
                      type="button"
                      class="btn-preview-action danger"
                      @click="handleRemoveImage"
                      title="Fjern bildet fra innsjekkingen"
                    >
                      <Trash2 :size="13" />
                      <span>Fjern bilde</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Ingen bilde (eller fjernet bilde) -->
              <div v-else class="photo-picker-box">
                <div v-if="isImageRemoved" class="removed-image-notice">
                  <span>Bildet vil bli fjernet ved lagring.</span>
                </div>

                <div class="photo-btn-grid">
                  <button
                    type="button"
                    class="btn-photo-action"
                    :disabled="isSubmitting || isProcessingImage"
                    @click="handleTakePhoto"
                  >
                    <Camera :size="18" class="action-icon" />
                    <div class="btn-text-wrap">
                      <span class="btn-title">Ta nytt bilde</span>
                      <span class="btn-sub">{{
                        isMobileDevice ? 'Åpne kamera' : 'Bruk webkamera'
                      }}</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    class="btn-photo-action"
                    :disabled="isSubmitting || isProcessingImage"
                    @click="galleryInputRef?.click()"
                  >
                    <ImageIcon :size="18" class="action-icon" />
                    <div class="btn-text-wrap">
                      <span class="btn-title">Velg fra album</span>
                      <span class="btn-sub">Bilder / filer</span>
                    </div>
                  </button>
                </div>

                <div v-if="isProcessingImage" class="processing-spinner">
                  <Loader2 class="spinner" :size="16" />
                  <span>Klargjør bilde...</span>
                </div>
              </div>
            </div>

            <!-- Synlighetsvalg -->
            <CheckinVisibilitySelector
              v-model="selectedVisibility"
              label="Hvem kan se denne innsjekkingen?"
              :disabled="isSubmitting"
            />

            <!-- Knapper for innsending og sletting -->
            <div class="modal-footer">
              <button
                type="button"
                class="btn-delete-checkin"
                :disabled="isSubmitting || isDeleting"
                @click="handleDeleteCheckin"
                title="Slett denne innsjekkingen permanent"
              >
                <Loader2 v-if="isDeleting" class="spinner" :size="15" />
                <Trash2 v-else :size="15" />
                <span>Slett innsjekking</span>
              </button>

              <div class="footer-right-actions">
                <button
                  type="button"
                  class="btn-cancel"
                  :disabled="isSubmitting || isDeleting"
                  @click="emit('close')"
                >
                  Avbryt
                </button>

                <button
                  type="submit"
                  class="btn-save"
                  :disabled="isSubmitting || isDeleting || isProcessingImage"
                >
                  <Loader2 v-if="isSubmitting" class="spinner" :size="16" />
                  <Check v-else :size="16" />
                  <span>{{ isSubmitting ? 'Lagrer endringer...' : 'Lagre endringer' }}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 11500;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  padding: 16px;
  box-sizing: border-box;
}

.edit-checkin-card {
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  box-shadow:
    0 25px 60px rgba(0, 0, 0, 0.8),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  color: #f8fafc;
  overflow: hidden;
  transition: box-shadow 0.2s ease;
}

.edit-checkin-card.is-dragging {
  user-select: none;
  -webkit-user-select: none;
  box-shadow:
    0 35px 80px rgba(0, 0, 0, 0.9),
    0 0 0 1px rgba(255, 255, 255, 0.2);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.card-header:active {
  cursor: grabbing;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.post-badge {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(14, 165, 233, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(14, 165, 233, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.header-text {
  display: flex;
  flex-direction: column;
}

.post-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #f8fafc;
}

.post-subtitle {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 1px;
}

.btn-close {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: #cbd5e1;
}

.mb-0 {
  margin-bottom: 0;
}

.optional-tag {
  font-size: 11px;
  font-weight: 400;
  color: #64748b;
}

.form-textarea {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 10px 12px;
  color: #f8fafc;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  min-height: 72px;
  outline: none;
  transition: border-color 0.2s;
}

.form-textarea:focus {
  border-color: #38bdf8;
}

.char-count {
  align-self: flex-end;
  font-size: 11px;
  color: #64748b;
}

.photo-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.btn-restore-img {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: #38bdf8;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
}

.btn-restore-img:hover {
  text-decoration: underline;
}

.hidden-input {
  display: none;
}

/* Forhåndsvisning */
.photo-preview-box {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(0, 0, 0, 0.4);
}

.preview-img {
  width: 100%;
  max-height: 220px;
  object-fit: cover;
  display: block;
}

.photo-preview-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.9);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.preview-tag {
  font-size: 11px;
  color: #94a3b8;
}

.preview-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-preview-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #e2e8f0;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-preview-action:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

.btn-preview-action.danger {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.25);
  color: #f87171;
}

.btn-preview-action.danger:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: #ef4444;
  color: #fca5a5;
}

/* Bildevelger */
.photo-picker-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.removed-image-notice {
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px dashed rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  font-size: 12px;
  color: #fca5a5;
  text-align: center;
}

.photo-btn-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.btn-photo-action {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: #f8fafc;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}

.btn-photo-action:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: #38bdf8;
  transform: translateY(-1px);
}

.btn-photo-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-icon {
  color: #38bdf8;
  flex-shrink: 0;
}

.btn-text-wrap {
  display: flex;
  flex-direction: column;
}

.btn-title {
  font-size: 13px;
  font-weight: 600;
}

.btn-sub {
  font-size: 11px;
  color: #94a3b8;
}

.processing-spinner {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  font-size: 12px;
  color: #94a3b8;
  padding: 8px 0;
}



/* Varslinger */
.alert-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
}

.alert-box.error {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
}

.alert-box.success {
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #6ee7b7;
}

.alert-icon {
  flex-shrink: 0;
}

/* Bunnknapper */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.footer-right-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-delete-checkin {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 10px;
  color: #fca5a5;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-delete-checkin:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.22);
  border-color: rgba(239, 68, 68, 0.6);
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
}

.btn-delete-checkin:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-cancel {
  padding: 10px 18px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: #cbd5e1;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.btn-save {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #0284c7, #0369a1);
  border: none;
  border-radius: 10px;
  color: #fff;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.3);
  transition: all 0.2s;
}

.btn-save:hover:not(:disabled) {
  background: linear-gradient(135deg, #0369a1, #075985);
  transform: translateY(-1px);
}

.btn-save:disabled,
.btn-cancel:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
