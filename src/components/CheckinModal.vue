<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Mountain, Camera, X, Check, Loader2, AlertCircle, Image as ImageIcon } from 'lucide-vue-next'
import type { TurpostItem } from '@/composables/useTurposter'
import { useAuth, type GoogleUser, type CheckinResult } from '@/composables/useAuth'

const props = defineProps<{
  isOpen: boolean
  turpost: TurpostItem | null
  user: GoogleUser | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submitted', result: CheckinResult): void
}>()

const { submitCheckin } = useAuth()

const description = ref('')
const selectedFile = ref<File | null>(null)
const previewUrl = ref<string | null>(null)
const isSubmitting = ref(false)
const errorMessage = ref<string | null>(null)
const isSuccess = ref(false)

const fileInputRef = ref<HTMLInputElement | null>(null)

// Tilbakestill tilstand når modalen åpnes/lukkes
watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      description.value = ''
      clearFile()
      errorMessage.value = null
      isSuccess.value = false
    }
  }
)

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

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
  selectedFile.value = file
  previewUrl.value = URL.createObjectURL(file)
}

const clearFile = () => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
  selectedFile.value = null
  previewUrl.value = null
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

// Komprimer bildet dersom det er veldig stort før opplasting
async function compressImageIfNeeded(file: File): Promise<File> {
  // Hvis under 1.5MB og vanlig format, behold originalen
  if (file.size <= 1.5 * 1024 * 1024) {
    return file
  }

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const maxDim = 1920
      let width = img.width
      let height = img.height

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(file)
        return
      }

      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
          } else {
            resolve(file)
          }
        },
        'image/jpeg',
        0.85
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
    img.src = url
  })
}

const handleSubmit = async () => {
  if (!props.turpost || !props.user || isSubmitting.value) return

  isSubmitting.value = true
  errorMessage.value = null

  try {
    let fileToUpload = selectedFile.value
    if (fileToUpload) {
      fileToUpload = await compressImageIfNeeded(fileToUpload)
    }

    const result = await submitCheckin({
      turpostId: props.turpost.id,
      turpostName: props.turpost.name,
      description: description.value.trim(),
      imageFile: fileToUpload
    })

    isSuccess.value = true
    emit('submitted', result)

    // Automatisk lukking etter kort pause
    setTimeout(() => {
      if (props.isOpen) {
        emit('close')
      }
    }, 1800)
  } catch (err: any) {
    errorMessage.value = err.message || 'Kunne ikke fullføre innsjekkingen. Prøv igjen.'
  } finally {
    isSubmitting.value = false
  }
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.isOpen && !isSubmitting.value) {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="checkin-fade">
      <div v-if="isOpen" class="checkin-overlay" @click.self="!isSubmitting && emit('close')">
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

              <!-- Last opp knapp / boks -->
              <div v-else class="upload-box" @click="fileInputRef?.click()">
                <Camera :size="24" class="camera-icon" />
                <div class="upload-text">
                  <strong>Ta bilde eller velg fil</strong>
                  <span>JPG, PNG eller WebP</span>
                </div>
              </div>

              <input
                ref="fileInputRef"
                type="file"
                accept="image/*"
                capture="environment"
                class="hidden-file-input"
                @change="handleFileChange"
              />
            </div>

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
                :disabled="isSubmitting"
              >
                <Loader2 v-if="isSubmitting" class="spinner" :size="18" />
                <Check v-else :size="18" />
                <span>{{ isSubmitting ? 'Lagrer innsjekk...' : 'Sjekk inn her' }}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
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
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
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

.upload-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 2px dashed rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.upload-box:hover {
  background: rgba(56, 189, 248, 0.05);
  border-color: #38bdf8;
}

.camera-icon {
  color: #38bdf8;
}

.upload-text {
  display: flex;
  flex-direction: column;
}

.upload-text strong {
  font-size: 13px;
  color: #f8fafc;
}

.upload-text span {
  font-size: 11px;
  color: #94a3b8;
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
</style>
