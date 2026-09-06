<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import MapViewer from './components/MapViewer.vue'
import LocationControls from './components/LocationControls.vue'
import TurposterPanel from './components/TurposterPanel.vue'
import CheckinModal from './components/CheckinModal.vue'
import TurpostCheckinsModal from './components/TurpostCheckinsModal.vue'
import UserProfileModal from './components/UserProfileModal.vue'
import AdminAddTurpostModal from './components/AdminAddTurpostModal.vue'
import GpsTrackModal from './components/GpsTrackModal.vue'
import SavedTracksPanel from './components/SavedTracksPanel.vue'
import { useGeolocation } from './composables/useGeolocation'
import { useTurposter, findKommuneInHierarchy, type TurpostItem, type FylkeInfo, type KommuneInfo } from './composables/useTurposter'
import { useAis } from './composables/useAis'
import { useAuth, type FirebaseCheckinItem } from './composables/useAuth'
import { useGeoDetect } from './composables/useGeoDetect'
import { useGpsTrackStore, type SavedTrack } from './stores/gpsTrack'
import { useAppUpdate } from './composables/useAppUpdate'

const {
  isLocating,
  isTracking,
  error: geoError,
  coords,
  trackPoints,
  getCurrentPosition,
  startTracking,
  stopTracking,
  clearTrack
} = useGeolocation()

const { detectKommune, isAbroad } = useGeoDetect()

const {
  isEnabled: isAisToggled,
  isZoomSufficient,
  minZoomForAis,
  currentZoom,
  vessels,
  isLoading: isAisLoading,
  error: aisError,
  setCredentials: setBwCredentials,
  fetchVessels,
  toggleAis,
  clearError: clearAisError
} = useAis()

const { user, isLoggedIn, isAdmin, aisClientId, aisClientSecret, fetchMyCheckins, logout } = useAuth()
const { needsUpdate, applyUpdate } = useAppUpdate()
const activeLayer = ref<string>('norgeskart')
const activeCheckinPost = ref<TurpostItem | null>(null)
const activeViewCheckinsPost = ref<TurpostItem | null>(null)
const isProfileOpen = ref(false)

// Sjekk om posisjon er i utlandet, og bytt til OpenStreetMap dersom Norgeskart er valgt
const checkAndApplyAbroadLayer = async (lat: number, lng: number) => {
  if (activeLayer.value === 'norgeskart' || activeLayer.value === 'kartverket_sjokart') {
    const abroad = await isAbroad(lat, lng)
    if (abroad) {
      activeLayer.value = 'standard'
    }
  }
}

// Watcher for brukerposisjon: hvis brukeren befinner seg i utlandet, velges automatisk OpenStreetMap
watch(
  coords,
  async (newCoords) => {
    if (newCoords) {
      await checkAndApplyAbroadLayer(newCoords.lat, newCoords.lng)
    }
  },
  { immediate: true }
)

// Admin-modus: brukeren MÅ aktivere det manuelt fra profilen
// isAdmin = rettigheten (fra regnearket), adminModeActive = om modus er PÅ
const adminModeActive = ref(false)

function handleToggleAdminMode() {
  if (isAdmin.value) {
    adminModeActive.value = !adminModeActive.value
  }
}

// Admin: ny turpost
const adminClickCoords = ref<{ lat: number; lng: number } | null>(null)

function handleAdminMapClick(coords: { lat: number; lng: number }) {
  if (adminClickCoords.value) return
  adminClickCoords.value = coords
}

// Brukerens egne innsjekkinger fra Firebase
const myCheckins = ref<FirebaseCheckinItem[]>([])
const visitedTurpostIds = computed(() => new Set(myCheckins.value.map(c => String(c.turpostId))))

const loadMyCheckins = async () => {
  if (!isLoggedIn.value) {
    myCheckins.value = []
    return
  }
  try {
    myCheckins.value = await fetchMyCheckins()
  } catch (err) {
    console.warn('[App] Kunne ikke laste brukerens innsjekkinger:', err)
  }
}

watch(
  isLoggedIn,
  (loggedIn) => {
    if (loggedIn) {
      loadMyCheckins()
    } else {
      myCheckins.value = []
    }
  },
  { immediate: true }
)

const handleOpenCheckin = (post: TurpostItem) => {
  activeCheckinPost.value = post
}

const handleViewCheckins = (post: TurpostItem) => {
  activeViewCheckinsPost.value = post
}

const handleOpenProfile = async () => {
  isProfileOpen.value = true
  await loadMyCheckins()
}

const handleLogoutFromProfile = () => {
  isProfileOpen.value = false
  logout()
}

const handleCheckinSubmitted = (result: any) => {
  if (result && result.turpostId) {
    myCheckins.value.push(result)
  }
}

const handleSelectTurpost = (_post: TurpostItem) => {
  // Kan benyttes for tilstandsoppdateringer ved klikk på turpost
}

// Når bruker logger inn (eller ut) synkroniseres AIS-nøklene automatisk
watch(
  [isLoggedIn, aisClientId, aisClientSecret],
  ([loggedIn, id, secret]) => {
    if (loggedIn && id && secret) {
      setBwCredentials(id, secret)
    } else if (!loggedIn) {
      setBwCredentials('', '')
      // Slå av AIS dersom bruker logger ut
      if (isAisToggled.value) toggleAis()
      // Hvis aktivt kartlag er et Google-kartlag ved utlogging, bytt tilbake til standard (hvis i utlandet) eller norgeskart
      if (activeLayer.value.startsWith('google_')) {
        const abroad = coords.value ? isAbroad(coords.value.lat, coords.value.lng) : false
        Promise.resolve(abroad).then((isAbr) => {
          activeLayer.value = isAbr ? 'standard' : 'norgeskart'
        })
      }
    }
  },
  { immediate: true }
)

const lastMapBounds = ref<{ minLat: number; maxLat: number; minLng: number; maxLng: number } | null>(null)
const lastMapZoom = ref<number>(13)

// Periodisk oppdatering av AIS-data hvert 30. sekund
const AIS_POLL_INTERVAL_MS = 30_000
let aisPollTimer: ReturnType<typeof setInterval> | null = null

const startAisPoll = () => {
  if (aisPollTimer) return
  aisPollTimer = setInterval(() => {
    if (isAisToggled.value && lastMapBounds.value) {
      fetchVessels(lastMapBounds.value, lastMapZoom.value)
    }
  }, AIS_POLL_INTERVAL_MS)
}

const stopAisPoll = () => {
  if (aisPollTimer) {
    clearInterval(aisPollTimer)
    aisPollTimer = null
  }
}

const handleBoundsChange = (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }, zoom: number) => {
  lastMapBounds.value = bounds
  lastMapZoom.value = zoom
  if (isAisToggled.value) {
    fetchVessels(bounds, zoom)
  }
}

const handleToggleAis = () => {
  if (!isAdmin.value) return
  toggleAis()
  if (isAisToggled.value && lastMapBounds.value) {
    fetchVessels(lastMapBounds.value, lastMapZoom.value)
    startAisPoll()
  } else {
    stopAisPoll()
  }
}

// Start/stopp poll automatisk dersom AIS blir slått av utenfra eller admin logger ut
watch(isAisToggled, (enabled) => {
  if (enabled && isAdmin.value) {
    startAisPoll()
  } else {
    stopAisPoll()
  }
})

watch(isAdmin, (admin) => {
  if (!admin && isAisToggled.value) {
    toggleAis()
    stopAisPoll()
  }
})

const {
  hierarchy,
  selectedFylke,
  selectedKommune,
  turposter,
  filteredTurposter,
  isLoadingHierarchy,
  isLoadingPosts,
  error: turError,
  searchQuery,
  loadHierarchy,
  selectFylke,
  selectKommune,
  selectKommuneByName,
  clearSelection
} = useTurposter()

const mapViewerRef = ref<InstanceType<typeof MapViewer> | null>(null)
const centerCoords = ref<{ lat: number; lng: number; zoom: number } | null>(null)
const isTurposterOpen = ref(false)
const showMunicipalities = ref(false)
const isTrackModalOpen = ref(false)
const isSavedTracksOpen = ref(false)
const trackStore = useGpsTrackStore()

// Synkroniser innlogget bruker med Pinia-sporene
watch(
  () => user.value?.userId,
  (newUid) => {
    trackStore.setUser(newUid)
  },
  { immediate: true }
)

// Bestem hvilke sporpunkter som skal tegnes på kartet:
// Dersom brukeren har valgt et lagret spor for visning, vises det.
// Ellers vises det aktive live-sporet.
const displayedTrackPoints = computed(() => {
  if (trackStore.activeTrack) {
    return trackStore.activeTrack.points
  }
  return trackPoints.value
})

const handleViewSavedTrack = (track: SavedTrack | null) => {
  if (track && mapViewerRef.value) {
    mapViewerRef.value.zoomToTrack(track.points)
  }
}

// Håndter åpning og lukking av turpost-panel
const handleToggleTurposter = () => {
  isTurposterOpen.value = !isTurposterOpen.value
  if (isTurposterOpen.value) {
    loadHierarchy()
  }
}

const handleSelectFylke = (fylke: FylkeInfo | null) => {
  selectFylke(fylke)
  if (fylke?.slug === 'utlandet' && (activeLayer.value === 'norgeskart' || activeLayer.value === 'kartverket_sjokart')) {
    activeLayer.value = 'standard'
  }
}

const handleSelectKommune = (kommune: KommuneInfo | null) => {
  selectKommune(kommune)
  if (selectedFylke.value?.slug === 'utlandet' && (activeLayer.value === 'norgeskart' || activeLayer.value === 'kartverket_sjokart')) {
    activeLayer.value = 'standard'
  }
}

// Når brukeren velger "Vis turposter" i popupen på kartet
const handleSelectKommuneByName = async (kommuneName: string) => {
  const result = await selectKommuneByName(kommuneName)
  if (result) {
    isTurposterOpen.value = true
    if (result.fylke?.slug === 'utlandet' && (activeLayer.value === 'norgeskart' || activeLayer.value === 'kartverket_sjokart')) {
      activeLayer.value = 'standard'
    }
  }
}

// Hjelpefunksjon som gir info om fylke og antall turposter for en kommune
const getKommuneInfo = (name: string) => {
  const match = findKommuneInHierarchy(hierarchy.value, name)
  if (match) {
    return { fylkeName: match.fylke.name, count: match.kommune.count }
  }
  return null
}

const handleFocusPost = (post: TurpostItem) => {
  if (selectedFylke.value?.slug === 'utlandet' && (activeLayer.value === 'norgeskart' || activeLayer.value === 'kartverket_sjokart')) {
    activeLayer.value = 'standard'
  }
  if (mapViewerRef.value) {
    mapViewerRef.value.flyToPost(post)
  }
}

const handleClearAllTurposter = () => {
  clearSelection()
}

// Håndter "Finn min posisjon"
const handleLocate = async () => {
  try {
    const location = await getCurrentPosition()
    if (location) {
      await checkAndApplyAbroadLayer(location.lat, location.lng)
      if (mapViewerRef.value) {
        mapViewerRef.value.centerOnUser(true, 16)
      }
    }
  } catch (err) {
    console.warn('Kunne ikke hente posisjon:', err)
  }
}

// Håndter "Vis turposter i min kommune"
const isLoadingLocalTurposter = ref(false)

const handleShowLocalTurposter = async () => {
  if (isLoadingLocalTurposter.value) return
  isLoadingLocalTurposter.value = true
  try {
    let loc = coords.value
    if (!loc) {
      loc = await getCurrentPosition()
    }
    if (!loc) {
      geoError.value = 'Kunne ikke hente din posisjon for å finne kommunen din.'
      return
    }

    const geoResult = await detectKommune(loc.lat, loc.lng)
    if (!geoResult || !geoResult.kommune) {
      // Posisjon er i utlandet – bytt automatisk til OpenStreetMap dersom Norgeskart er aktivt
      if (activeLayer.value === 'norgeskart' || activeLayer.value === 'kartverket_sjokart') {
        activeLayer.value = 'standard'
      }
      // Forsøk å vise turposter for Utlandet
      const utlandResult = await selectKommuneByName('Utlandet')
      if (utlandResult) {
        isTurposterOpen.value = false
        if (mapViewerRef.value) {
          mapViewerRef.value.centerOnUser(true, 13)
        }
        return
      }
      turError.value = 'Du er i utlandet, og det er ikke registrert noen turposter her ennå.'
      return
    }

    const result = await selectKommuneByName(geoResult.kommune)
    if (result) {
      isTurposterOpen.value = false
      if (mapViewerRef.value) {
        mapViewerRef.value.centerOnUser(true, 13)
      }
    } else {
      turError.value = `Fant ingen registrerte turposter for ${geoResult.kommune}.`
    }
  } catch (err: any) {
    console.warn('Kunne ikke finne lokal kommune:', err)
  } finally {
    isLoadingLocalTurposter.value = false
  }
}

// Håndter live sporing / sporlogg ("Følg meg")
const handleToggleTracking = () => {
  if (isTracking.value) {
    stopTracking()
  } else {
    trackStore.clearActiveTrack()
    clearTrack()
    startTracking(
      { enableHighAccuracy: true },
      (newCoords) => {
        if (mapViewerRef.value && newCoords) {
          mapViewerRef.value.centerOnUser(true)
        }
      }
    )
  }
}

// Hvis brukeren drar manuelt i kartet, lar vi GPS-sporingen fortsette i bakgrunnen
const handleMapDragged = () => {
  // Panning i kartet stopper ikke sporloggen
}

// Kartlagbytte
const handleChangeLayer = async (layerId: string) => {
  if (layerId.startsWith('google_') && !isLoggedIn.value) {
    const abroad = coords.value ? await isAbroad(coords.value.lat, coords.value.lng) : false
    activeLayer.value = abroad ? 'standard' : 'norgeskart'
    return
  }
  activeLayer.value = layerId
}

// Nullstill feil
const handleClearError = () => {
  geoError.value = null
  turError.value = null
  clearAisError()
}

const handleCoordinatesChange = (coordsData: { lat: number; lng: number; zoom: number }) => {
  centerCoords.value = coordsData
}

// Last hierarki og forsøk automatisk å hente brukerens geolokasjon ved oppstart
onMounted(async () => {
  loadHierarchy()
  try {
    const loc = await getCurrentPosition({ timeout: 5000, enableHighAccuracy: true })
    if (loc) {
      await checkAndApplyAbroadLayer(loc.lat, loc.lng)
      if (mapViewerRef.value) {
        mapViewerRef.value.centerOnUser(true, 15)
      }
    }
  } catch {
    // Hvis brukeren ikke gir tilgang, forblir kartet elegant på Bergen
  }
})

onUnmounted(() => {
  stopAisPoll()
})
</script>

<template>
  <main class="app-root">

    <MapViewer
      ref="mapViewerRef"
      :user-location="coords"
      :active-layer="activeLayer"
      :is-tracking="isTracking"
      :track-points="displayedTrackPoints"
      :turposter="turposter"
      :show-municipalities="showMunicipalities"
      :selected-kommune-name="selectedKommune ? selectedKommune.name : null"
      :get-kommune-info="getKommuneInfo"
      :vessels="vessels"
      :is-ais-toggled="isAisToggled"
      :is-zoom-sufficient="isZoomSufficient"
      :is-logged-in="isLoggedIn"
      :visited-turpost-ids="visitedTurpostIds"
      :is-admin="adminModeActive"
      @map-dragged="handleMapDragged"
      @coordinates-change="handleCoordinatesChange"
      @bounds-change="handleBoundsChange"
      @select-turpost="handleSelectTurpost"
      @checkin-turpost="handleOpenCheckin"
      @view-checkins="handleViewCheckins"
      @select-kommune-by-name="handleSelectKommuneByName"
      @clear-turposter="handleClearAllTurposter"
      @admin-map-click="handleAdminMapClick"
    />

    <LocationControls
      :user-location="coords"
      :is-locating="isLocating"
      :is-tracking="isTracking"
      :has-track="trackPoints.length > 0"
      :error="geoError || turError || aisError"
      :active-layer="activeLayer"
      :center-coords="centerCoords"
      :is-turposter-open="isTurposterOpen"
      :active-kommune-name="selectedKommune ? selectedKommune.name : null"
      :turpost-count="turposter.length"
      :show-municipalities="showMunicipalities"
      :is-ais-toggled="isAisToggled"
      :is-zoom-sufficient="isZoomSufficient"
      :ais-vessel-count="vessels.length"
      :is-ais-loading="isAisLoading"
      :current-zoom="currentZoom"
      :min-zoom-for-ais="minZoomForAis"
      :is-logged-in="isLoggedIn"
      :is-admin="isAdmin"
      :is-loading-local-turposter="isLoadingLocalTurposter"
      :saved-tracks-count="trackStore.savedTracks.length"
      :is-saved-tracks-open="isSavedTracksOpen"
      :needs-update="needsUpdate"
      @locate="handleLocate"
      @toggle-tracking="handleToggleTracking"
      @clear-track="clearTrack"
      @open-track-modal="isTrackModalOpen = true"
      @open-saved-tracks="isSavedTracksOpen = !isSavedTracksOpen"
      @change-layer="handleChangeLayer"
      @clear-error="handleClearError"
      @toggle-turposter="handleToggleTurposter"
      @toggle-municipalities="showMunicipalities = !showMunicipalities"
      @toggle-ais="handleToggleAis"
      @show-local-turposter="handleShowLocalTurposter"
      @open-profile="handleOpenProfile"
      @apply-update="applyUpdate"
    />

    <TurposterPanel
      :is-open="isTurposterOpen"
      :hierarchy="hierarchy"
      :selected-fylke="selectedFylke"
      :selected-kommune="selectedKommune"
      :turposter="turposter"
      :filtered-turposter="filteredTurposter"
      :is-loading-hierarchy="isLoadingHierarchy"
      :is-loading-posts="isLoadingPosts"
      :search-query="searchQuery"
      :is-logged-in="isLoggedIn"
      :visited-turpost-ids="visitedTurpostIds"
      @close="isTurposterOpen = false"
      @select-fylke="handleSelectFylke"
      @select-kommune="handleSelectKommune"
      @update:search-query="searchQuery = $event"
      @focus-post="handleFocusPost"
      @view-checkins="handleViewCheckins"
      @clear-all="handleClearAllTurposter"
    />

    <!-- Innsjekkingsmodal for turpost -->
    <CheckinModal
      :is-open="!!activeCheckinPost"
      :turpost="activeCheckinPost"
      :user="user"
      :user-location="coords"
      @close="activeCheckinPost = null"
      @submitted="handleCheckinSubmitted"
    />

    <!-- Modal for visning av alle innsjekkinger på en turpost -->
    <TurpostCheckinsModal
      :is-open="!!activeViewCheckinsPost"
      :turpost="activeViewCheckinsPost"
      :is-logged-in="isLoggedIn"
      :has-visited="activeViewCheckinsPost ? visitedTurpostIds.has(String(activeViewCheckinsPost.id)) : false"
      :current-user-id="user?.userId"
      :user-location="coords"
      @close="activeViewCheckinsPost = null"
      @open-checkin="(post) => { activeViewCheckinsPost = null; activeCheckinPost = post }"
    />

    <!-- Profilvisning med brukerens innsjekkede turposter og utlogging -->
    <UserProfileModal
      :is-open="isProfileOpen"
      :user="user"
      :checkins="myCheckins"
      :is-admin="isAdmin"
      :is-admin-mode-active="adminModeActive"
      :saved-tracks-count="trackStore.savedTracks.length"
      @close="isProfileOpen = false"
      @logout="handleLogoutFromProfile"
      @toggle-admin-mode="handleToggleAdminMode"
      @open-saved-tracks="isSavedTracksOpen = true"
    />

    <!-- Modal for GPS-sporlogg (last ned GPX eller slett) -->
    <GpsTrackModal
      :is-open="isTrackModalOpen"
      :track-points="trackPoints"
      :is-tracking="isTracking"
      @close="isTrackModalOpen = false"
      @clear-track="clearTrack"
      @toggle-tracking="handleToggleTracking"
      @open-saved-tracks="isSavedTracksOpen = true"
    />

    <!-- Panel for administrering og visning av lagrede GPS-spor -->
    <SavedTracksPanel
      :is-open="isSavedTracksOpen"
      :live-track-points="trackPoints"
      :is-tracking="isTracking"
      @close="isSavedTracksOpen = false"
      @view-track="handleViewSavedTrack"
      @open-live-track-modal="isTrackModalOpen = true"
    />

    <!-- Admin: Legg til ny turpost -->
    <AdminAddTurpostModal
      v-if="adminModeActive"
      :is-open="!!adminClickCoords"
      :lat="adminClickCoords?.lat ?? 0"
      :lng="adminClickCoords?.lng ?? 0"
      @close="adminClickCoords = null"
    />
  </main>
</template>

<style scoped>
.app-root {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: #0f172a;
}
</style>
