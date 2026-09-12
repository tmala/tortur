<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { Camera, X, Loader2 } from 'lucide-vue-next'

const emit = defineEmits<{
  (e: 'photo', file: File): void
  (e: 'close'): void
  (e: 'error', message: string): void
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const webcamStream = ref<MediaStream | null>(null)
const isStarting = ref(true)

async function startWebcam() {
  isStarting.value = true
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    emit(
      'error',
      'Webkamera støttes ikke i denne nettleseren. Vennligst velg en bildefil i stedet.'
    )
    emit('close')
    return
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    })
    webcamStream.value = stream
    await nextTick()
    if (videoRef.value) {
      videoRef.value.srcObject = stream
      await videoRef.value.play().catch(() => {})
    }
  } catch (err: unknown) {
    stopWebcam()
    console.warn('Feil ved åpning av webkamera:', err)
    const errName = err instanceof Error ? err.name : ''
    if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
      emit(
        'error',
        'Ingen tilgang til webkamera. Vennligst tillat kamera i nettleseren, eller velg en bildefil.'
      )
    } else {
      emit('error', 'Kunne ikke starte webkamera. Velg en bildefil i stedet.')
    }
    emit('close')
  } finally {
    isStarting.value = false
  }
}

function stopWebcam() {
  if (webcamStream.value) {
    webcamStream.value.getTracks().forEach((track) => track.stop())
    webcamStream.value = null
  }
  if (videoRef.value) {
    videoRef.value.srcObject = null
  }
}

function handleClose() {
  stopWebcam()
  emit('close')
}

async function capturePhoto() {
  if (!videoRef.value) return
  const video = videoRef.value
  const width = video.videoWidth || 1280
  const height = video.videoHeight || 720

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    handleClose()
    return
  }

  ctx.drawImage(video, 0, 0, width, height)
  stopWebcam()

  canvas.toBlob(
    (blob) => {
      canvas.width = 0
      canvas.height = 0
      if (blob) {
        const file = new File([blob], `webkamera_${Date.now()}.jpg`, {
          type: 'image/jpeg',
        })
        emit('photo', file)
      } else {
        emit('close')
      }
    },
    'image/jpeg',
    0.85
  )
}

onMounted(() => {
  startWebcam()
})

onUnmounted(() => {
  stopWebcam()
})
</script>

<template>
  <div class="webcam-container">
    <div v-if="isStarting" class="webcam-loading">
      <Loader2 class="spinner" :size="24" />
      <span>Starter kamera...</span>
    </div>
    <video
      ref="videoRef"
      class="webcam-video"
      autoplay
      playsinline
      muted
    ></video>
    <div class="webcam-controls">
      <button type="button" class="btn-webcam-cancel" @click="handleClose">
        <X :size="16" />
        <span>Avbryt</span>
      </button>
      <button
        type="button"
        class="btn-webcam-snap"
        :disabled="isStarting"
        @click="capturePhoto"
      >
        <Camera :size="18" />
        <span>Knips bilde</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.webcam-container {
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  background: #000000;
  border: 1px solid rgba(56, 189, 248, 0.4);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  position: relative;
}

.webcam-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #000;
  color: #94a3b8;
  font-size: 13px;
  z-index: 2;
}

.webcam-video {
  width: 100%;
  max-height: 240px;
  object-fit: cover;
  background: #000000;
  display: block;
}

.webcam-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.95);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 3;
}

.btn-webcam-cancel {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #cbd5e1;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-webcam-cancel:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
}

.btn-webcam-snap {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: linear-gradient(135deg, #0284c7, #2563eb);
  border: 1px solid #38bdf8;
  border-radius: 8px;
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 10px rgba(2, 132, 199, 0.4);
}

.btn-webcam-snap:hover:not(:disabled) {
  background: linear-gradient(135deg, #0369a1, #1d4ed8);
  transform: translateY(-1px);
}

.btn-webcam-snap:disabled {
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
