<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SavedTracksPanel from '@/components/SavedTracksPanel.vue'
import GpsTrackModal from '@/components/GpsTrackModal.vue'
import { useGeolocation } from '@/composables/useGeolocation'
import { useAuth } from '@/composables/useAuth'
import { useGpsTrackStore, type SavedTrack } from '@/stores/gpsTrack'
import { useAppStateStore } from '@/stores/appState'

const route = useRoute()
const router = useRouter()
const { isLoggedIn } = useAuth()
const { trackPoints, isTracking, startTracking, stopTracking, clearTrack } = useGeolocation()
const trackStore = useGpsTrackStore()
const appState = useAppStateStore()

const showLiveModal = ref(false)

onMounted(() => {
  if (route.query.tab === 'live') {
    showLiveModal.value = true
  }
})

const handleClose = () => {
  router.push('/')
}

const handleViewTrack = (track: SavedTrack | null) => {
  appState.requestViewTrack(track)
  router.push('/')
}

const handleToggleTracking = () => {
  if (isTracking.value) {
    stopTracking()
  } else {
    trackStore.clearActiveTrack()
    clearTrack()
    startTracking({ enableHighAccuracy: true })
  }
}
</script>

<template>
  <div>
    <!-- Lagrede spor panel -->
    <SavedTracksPanel
      :is-open="!showLiveModal"
      :live-track-points="trackPoints"
      :is-tracking="isTracking"
      :is-logged-in="isLoggedIn"
      @close="handleClose"
      @view-track="handleViewTrack"
      @open-live-track-modal="showLiveModal = true"
    />

    <!-- Aktiv live-spor modal -->
    <GpsTrackModal
      :is-open="showLiveModal"
      :track-points="trackPoints"
      :is-tracking="isTracking"
      @close="handleClose"
      @clear-track="clearTrack"
      @toggle-tracking="handleToggleTracking"
      @open-saved-tracks="showLiveModal = false"
    />
  </div>
</template>
