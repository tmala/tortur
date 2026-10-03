<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, useTemplateRef } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useGpsTrackStore, type SavedTrack } from '@/stores/gpsTrack'
import { prepareFlyoverPath, type FlyoverSamplePoint } from '@/utils/flyoverPath'
import { useFlyoverCamera } from '@/composables/flyover/useFlyoverCamera'
import { useFlyoverPlayback } from '@/composables/flyover/useFlyoverPlayback'
import FlyoverMap from '@/components/flyover/FlyoverMap.vue'
import FlyoverHud from '@/components/flyover/FlyoverHud.vue'
import FlyoverControls from '@/components/flyover/FlyoverControls.vue'
import ElevationProfile from '@/components/flyover/ElevationProfile.vue'

const router = useRouter()
const route = useRoute()
const trackStore = useGpsTrackStore()
const { activeTrack, savedTracks } = storeToRefs(trackStore)

const mapComponentRef = useTemplateRef<InstanceType<typeof FlyoverMap>>('mapComponentRef')
const flyoverRootRef = useTemplateRef<HTMLDivElement>('flyoverRootRef')

const isFullscreen = ref(false)
const isRecordingVideo = ref(false)
const canRecordVideo = ref(false)

const resolveInitialTrack = (): SavedTrack | null => {
  if (typeof window === 'undefined') return null

  // 1. Sjekk om det ligger et spor i sessionStorage (f.eks. ved popup-vindu fra MapView)
  try {
    const cachedTrackStr = sessionStorage.getItem('tortur_active_flyover_track')
    if (cachedTrackStr) {
      const parsed = JSON.parse(cachedTrackStr) as SavedTrack
      if (parsed && parsed.points && parsed.points.length >= 2) {
        return parsed
      }
    }
  } catch {
    // Ignorer
  }

  // 2. Sjekk route query
  const queryTrackId = route.query.trackId as string | undefined
  if (queryTrackId && savedTracks.value.length > 0) {
    const match = savedTracks.value.find((t) => t.id === queryTrackId)
    if (match && match.points && match.points.length >= 2) {
      return match
    }
  }

  // 3. Sjekk lagrede spor i localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('tortur_saved_tracks_')) {
        const list = JSON.parse(localStorage.getItem(k) || '[]') as SavedTrack[]
        if (Array.isArray(list) && list.length > 0) {
          const match = queryTrackId ? list.find((t) => t.id === queryTrackId) : list[0]
          if (match && match.points && match.points.length >= 2) {
            return match
          }
        }
      }
    }
  } catch {
    // Ignorer
  }

  return null
}

const standaloneTrack = ref<SavedTrack | null>(resolveInitialTrack())
let mediaRecorder: MediaRecorder | null = null
let recordedChunks: Blob[] = []

const isPopout = computed(() => {
  if (typeof window !== 'undefined' && window.opener) return true
  return route.query.popout === 'true'
})

// Hvis activeTrack ikke er satt, prøv å finne det fra query-param eller savedTracks
const effectiveTrack = computed(() => {
  if (activeTrack.value) return activeTrack.value
  if (standaloneTrack.value) return standaloneTrack.value
  const queryTrackId = route.query.trackId as string | undefined
  if (queryTrackId) {
    return savedTracks.value.find((t) => t.id === queryTrackId) || null
  }
  return null
})

// Forbered 3D flyover-bane
const flyoverPath = computed(() => {
  const track = effectiveTrack.value
  if (!track || !track.points || track.points.length < 2) {
    return prepareFlyoverPath([])
  }
  return prepareFlyoverPath(track.points, 8, 75)
})

// Kamera-composable
const {
  cameraMode,
  setCameraMode,
  updateCamera
} = useFlyoverCamera(() => mapComponentRef.value?.mapInstance || null)

// Avspillings-composable
const {
  isPlaying,
  progress,
  elapsedSeconds,
  remainingSeconds,
  targetDurationSeconds,
  speedMultiplier,
  currentPoint,
  play,
  pause,
  toggle,
  seek,
  restart,
  setTargetDuration,
  setSpeed,
  cleanup: cleanupPlayback
} = useFlyoverPlayback(
  () => flyoverPath.value,
  (pt: FlyoverSamplePoint, dtSeconds: number) => {
    if (mapComponentRef.value) {
      mapComponentRef.value.updateProgress(pt, flyoverPath.value)
    }
    updateCamera(pt, dtSeconds)
  }
)

const handleClose = () => {
  cleanupPlayback()
  if (isFullscreen.value && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {})
  }
  if (isPopout.value && (window.opener || window.history.length <= 1)) {
    window.close()
  } else {
    router.push('/')
  }
}

const handlePopout = () => {
  if (!effectiveTrack.value) return
  try {
    sessionStorage.setItem('tortur_active_flyover_track', JSON.stringify(effectiveTrack.value))
  } catch {
    // Ignorer
  }

  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const trackIdQuery = effectiveTrack.value.id ? `trackId=${effectiveTrack.value.id}&` : ''
  const popoutUrl = `${window.location.origin}${base}/spor-3d?${trackIdQuery}popout=true`
  window.open(popoutUrl, '_blank', 'width=1280,height=800,menubar=no,toolbar=no,location=no,status=no')

  // Lukk overlay i modervinduet slik at brukeren har ren kartvisning her
  handleClose()
}

const handleToggleFullscreen = async () => {
  try {
    if (!document.fullscreenElement) {
      if (flyoverRootRef.value?.requestFullscreen) {
        await flyoverRootRef.value.requestFullscreen()
        isFullscreen.value = true
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen()
        isFullscreen.value = false
      }
    }
  } catch (err) {
    console.warn('[TrackFlyoverView] Feil ved fullskjerm-skifte:', err)
  }
}

const handleFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement
}

// Tastatur-snarveier
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault()
    toggle()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    seek(progress.value - 0.05)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    seek(progress.value + 0.05)
  } else if (e.key === 'Escape') {
    handleClose()
  }
}

// Videoopptak med MediaRecorder
const handleToggleVideoRecord = () => {
  if (isRecordingVideo.value) {
    stopVideoRecording()
  } else {
    startVideoRecording()
  }
}

const startVideoRecording = () => {
  const canvas = mapComponentRef.value?.getCanvas()
  if (!canvas) return

  try {
    const stream = canvas.captureStream(30)
    let mimeType = 'video/webm;codecs=vp9'
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm'
    }

    recordedChunks = []
    mediaRecorder = new MediaRecorder(stream, { mimeType })

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data)
      }
    }

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const name = effectiveTrack.value?.name || 'spor'
      a.href = url
      a.download = `tortur-3d-${name.toLowerCase().replace(/\s+/g, '-')}.webm`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      isRecordingVideo.value = false
    }

    mediaRecorder.start(1000)
    isRecordingVideo.value = true

    // Start avspilling hvis pauset
    if (!isPlaying.value) {
      if (progress.value >= 0.99) seek(0)
      play()
    }
  } catch (err) {
    console.error('[TrackFlyoverView] Kunne ikke starte videoopptak:', err)
    isRecordingVideo.value = false
  }
}

const stopVideoRecording = () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  isRecordingVideo.value = false
}

const onMapReady = () => {
  if (mapComponentRef.value && flyoverPath.value.points.length >= 2) {
    // Zoom til hele sporet først
    mapComponentRef.value.fitTrackBounds(flyoverPath.value)

    // Start avspilling etter en liten pause for å la kameraet sette seg
    setTimeout(() => {
      play()
    }, 300)
  }
}

onMounted(() => {
  // Hvis ingen spor ble funnet synkront, prøv å laste fra trackStore
  if (!effectiveTrack.value) {
    trackStore.loadTracks('guest')
    if (savedTracks.value.length > 0) {
      const queryTrackId = route.query.trackId as string | undefined
      const match = queryTrackId
        ? savedTracks.value.find((t) => t.id === queryTrackId)
        : savedTracks.value[0]
      if (match && match.points && match.points.length >= 2) {
        standaloneTrack.value = match
      }
    }
  }

  // Sjekk om det mangler gyldig spor etter innlasting
  if (!effectiveTrack.value || !effectiveTrack.value.points || effectiveTrack.value.points.length < 2) {
    setTimeout(() => {
      if (!effectiveTrack.value) {
        if (isPopout.value && window.opener) {
          window.close()
        } else {
          router.replace('/')
        }
      }
    }, 1200)
    return
  }

  // Sjekk om videoopptak støttes
  canRecordVideo.value =
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'

  window.addEventListener('keydown', handleKeyDown)
  document.addEventListener('fullscreenchange', handleFullscreenChange)
})

onUnmounted(() => {
  cleanupPlayback()
  if (isRecordingVideo.value) {
    stopVideoRecording()
  }
  window.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
})
</script>

<template>
  <div ref="flyoverRootRef" class="track-flyover-overlay">
    <!-- 3D Kartkomponent -->
    <FlyoverMap
      ref="mapComponentRef"
      :path="flyoverPath"
      @map-ready="onMapReady"
    />

    <!-- Topp HUD og statistikk -->
    <FlyoverHud
      :track-name="effectiveTrack?.name || 'GPS-spor'"
      :path="flyoverPath"
      :current-point="currentPoint"
      :is-fullscreen="isFullscreen"
      :is-popout="isPopout"
      @close="handleClose"
      @toggle-fullscreen="handleToggleFullscreen"
      @popout="handlePopout"
    />

    <!-- Høydeprofil over kontrollene -->
    <div class="flyover-elevation-wrapper">
      <ElevationProfile
        :path="flyoverPath"
        :progress="progress"
        @seek="seek"
      />
    </div>

    <!-- Avspillingskontroller i bunnen -->
    <FlyoverControls
      :is-playing="isPlaying"
      :progress="progress"
      :elapsed-seconds="elapsedSeconds"
      :remaining-seconds="remainingSeconds"
      :target-duration-seconds="targetDurationSeconds"
      :speed-multiplier="speedMultiplier"
      :camera-mode="cameraMode"
      :active-layer-id="mapComponentRef?.activeLayerId || 'opentopomap'"
      :terrain-exaggeration="mapComponentRef?.terrainExaggeration || 1.3"
      :is-recording-video="isRecordingVideo"
      :can-record-video="canRecordVideo"
      @play="play"
      @pause="pause"
      @toggle="toggle"
      @restart="restart"
      @seek="seek"
      @set-duration="setTargetDuration"
      @set-speed="setSpeed"
      @set-camera-mode="setCameraMode"
      @change-layer="mapComponentRef?.changeTileLayer($event)"
      @change-terrain-exaggeration="mapComponentRef?.setTerrainExaggeration($event)"
      @toggle-video-record="handleToggleVideoRecord"
    />
  </div>
</template>

<style scoped>
.track-flyover-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100vw;
  height: 100vh;
  z-index: 5000;
  background-color: #0f172a;
  overflow: hidden;
}

.flyover-elevation-wrapper {
  position: absolute;
  bottom: 110px;
  right: 16px;
  width: 280px;
  z-index: 1000;
}

@media (max-width: 640px) {
  .flyover-elevation-wrapper {
    display: none; /* Skjul høydeprofil på veldig små mobilskjermer for å unngå overlapping */
  }
}
</style>
