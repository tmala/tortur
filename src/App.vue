<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import MapViewer from './components/MapViewer.vue'
import LocationControls from './components/LocationControls.vue'
import TurposterPanel from './components/TurposterPanel.vue'
import CheckinModal from './components/CheckinModal.vue'
import TurpostCheckinsModal from './components/TurpostCheckinsModal.vue'
import UserProfileModal from './components/UserProfileModal.vue'
import AdminAddTurpostModal from './components/AdminAddTurpostModal.vue'
import MySpotsModal from './components/MySpotsModal.vue'
import SpotSuggestionsModal from './components/SpotSuggestionsModal.vue'
import GpsTrackModal from './components/GpsTrackModal.vue'
import SavedTracksPanel from './components/SavedTracksPanel.vue'
import FriendsModal from './components/FriendsModal.vue'
import { useGeolocation, calculateDistanceMeters, type GeoLocationState } from './composables/useGeolocation'
import { useTurposter, findKommuneInHierarchy, type TurpostItem, type FylkeInfo, type KommuneInfo } from './composables/useTurposter'
import { usePrivateTurposter, type SpotSuggestion } from './composables/usePrivateTurposter'
import { useAis } from './composables/useAis'
import { useAuth, type FirebaseCheckinItem } from './composables/useAuth'
import { useFriends } from './composables/useFriends'
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
const {
  friends,
  incomingRequests,
  registerPublicUser,
  loadFriends,
  loadFriendRequests,
  loadDefaultVisibility
} = useFriends()
const { needsUpdate, applyUpdate } = useAppUpdate()
const activeLayer = ref<string>('norgeskart')
const activeCheckinPost = ref<TurpostItem | null>(null)
const activeViewCheckinsPost = ref<TurpostItem | null>(null)
const isProfileOpen = ref(false)
const isFriendsOpen = ref(false)

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

// Private turposter (my_spots) og innkommende forslag
const {
  fetchMySpots,
  saveMySpot,
  suggestExistingSpotForPublic,
  deleteMySpot,
  fetchMyPrivateCheckins,
  fetchSpotSuggestions
} = usePrivateTurposter()

const mySpots = ref<TurpostItem[]>([])
const isMySpotsLoading = ref(false)
const isMySpotsOpen = ref(false)
const isSpotSuggestionsOpen = ref(false)
const spotSuggestionsCount = ref(0)
const isAddSpotModeActive = ref(false)

// Admin / Bruker: ny turpost (kart-klikk)
const adminClickCoords = ref<{ lat: number; lng: number } | null>(null)

function handleAdminMapClick(coords: { lat: number; lng: number }) {
  if (adminClickCoords.value) return
  adminClickCoords.value = coords
}

const loadMySpots = async () => {
  if (!isLoggedIn.value || !user.value) {
    mySpots.value = []
    return
  }
  try {
    isMySpotsLoading.value = true
    mySpots.value = await fetchMySpots(user.value.userId)
  } catch (err) {
    console.warn('[App] Kunne ikke laste brukerens private turposter:', err)
  } finally {
    isMySpotsLoading.value = false
  }
}

const loadSpotSuggestions = async () => {
  if (!isAdmin.value) return
  try {
    const list = await fetchSpotSuggestions()
    spotSuggestionsCount.value = list.length
  } catch (err) {
    console.warn('[App] Kunne ikke hente forslag:', err)
  }
}

function handleSpotSaved(spot: TurpostItem) {
  mySpots.value = [spot, ...mySpots.value.filter((s) => s.id !== spot.id)]
  isAddSpotModeActive.value = false
  adminClickCoords.value = null
  if (isAdmin.value) {
    loadSpotSuggestions()
  }
}

async function handleSuggestExistingSpotForPublic(spot: TurpostItem) {
  if (!user.value) return
  try {
    await suggestExistingSpotForPublic(user.value.userId, spot, {
      name: user.value.userName || 'Ukjent bruker',
      email: user.value.email || ''
    })
    alert(`Forslag om å gjøre «${spot.name}» til en offentlig turpost er sendt inn!`)
    await loadMySpots()
    if (isAdmin.value) {
      await loadSpotSuggestions()
    }
  } catch (err: any) {
    console.warn('[App] Kunne ikke foreslå turpost som offentlig:', err)
    alert('Kunne ikke sende inn forslag: ' + (err?.message || 'Ukjent feil'))
  }
}

async function handleDeletePrivateSpot(spotId: string) {
  if (!user.value) return
  try {
    await deleteMySpot(user.value.userId, spotId)
    mySpots.value = mySpots.value.filter((s) => s.id !== spotId)
    await loadMyCheckins()
  } catch (err) {
    console.warn('[App] Kunne ikke slette privat turpost:', err)
  }
}

function handleViewSpotOnMap(spot: TurpostItem | SpotSuggestion) {
  if (!mapViewerRef.value) return
  if ('suggestedAt' in spot || 'csvLine' in spot) {
    mapViewerRef.value.showSpotSuggestion(spot as SpotSuggestion)
  } else {
    mapViewerRef.value.flyToPost(spot as TurpostItem)
  }
}

function handleCloseSpotSuggestions() {
  isSpotSuggestionsOpen.value = false
  loadSpotSuggestions()
  if (mapViewerRef.value) {
    mapViewerRef.value.clearSpotSuggestion()
  }
}

// Brukerens egne innsjekkinger fra Firebase (både offentlige og private)
const myCheckins = ref<FirebaseCheckinItem[]>([])
const visitedTurpostIds = computed(() => new Set(myCheckins.value.map(c => String(c.turpostId))))

const loadMyCheckins = async () => {
  if (!isLoggedIn.value || !user.value) {
    myCheckins.value = []
    return
  }
  try {
    const [publicCheckins, privateCheckins] = await Promise.all([
      fetchMyCheckins(),
      fetchMyPrivateCheckins(user.value.userId)
    ])
    const privateCheckinIds = new Set(privateCheckins.map(c => c.id))
    const filteredPublic = publicCheckins.filter(
      c => !privateCheckinIds.has(c.id) && !String(c.turpostId).startsWith('spot_')
    )
    myCheckins.value = [...filteredPublic, ...privateCheckins]
  } catch (err) {
    console.warn('[App] Kunne ikke laste brukerens innsjekkinger:', err)
  }
}

watch(
  isLoggedIn,
  (loggedIn) => {
    if (loggedIn) {
      loadMyCheckins()
      loadMySpots()
      if (user.value) {
        registerPublicUser(user.value)
        loadFriends(user.value.userId)
        loadFriendRequests(user.value.userId)
        loadDefaultVisibility(user.value.userId)
      }
      if (isAdmin.value) {
        loadSpotSuggestions()
      }
    } else {
      myCheckins.value = []
      mySpots.value = []
      spotSuggestionsCount.value = 0
      isFriendsOpen.value = false
    }
  },
  { immediate: true }
)

const handleOpenCheckin = (post: TurpostItem) => {
  activeCheckinPost.value = post
}

const activeMatchingPrivateSpot = ref<TurpostItem | null>(null)
const activeViewCheckinsTab = ref<'public' | 'private' | undefined>(undefined)

const handleViewCheckins = (
  post: TurpostItem,
  initialTab?: 'public' | 'private',
  matchingPrivate?: TurpostItem | null
) => {
  activeViewCheckinsPost.value = post
  activeViewCheckinsTab.value = initialTab
  activeMatchingPrivateSpot.value = matchingPrivate || (
    !post.isPrivate
      ? (mySpots.value.find(s => String(s.id) === String(post.id) || (calculateDistanceMeters(s.lat, s.lng, post.lat, post.lng) < 15)) || null)
      : null
  )
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
  if (mapViewerRef.value) {
    mapViewerRef.value.resetAutoCenter()
  }
  selectKommune(kommune)
  if (selectedFylke.value?.slug === 'utlandet' && (activeLayer.value === 'norgeskart' || activeLayer.value === 'kartverket_sjokart')) {
    activeLayer.value = 'standard'
  }
}

// Når brukeren velger "Vis turposter" i popupen på kartet
const handleSelectKommuneByName = async (kommuneName: string) => {
  if (mapViewerRef.value) {
    mapViewerRef.value.resetAutoCenter()
  }
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
const hasLoadedDefaultTurposter = ref(false)

const loadLocalTurposterForLocation = async (loc: GeoLocationState, showFeedback = false) => {
  if (isLoadingLocalTurposter.value) return
  isLoadingLocalTurposter.value = true
  try {
    // Sentrer kartutsnittet der brukeren befinner seg umiddelbart
    mapViewerRef.value?.centerOnUser?.(true, 15)
    await checkAndApplyAbroadLayer(loc.lat, loc.lng)
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
        return
      }
      if (showFeedback) {
        turError.value =
          'Posisjonen din ser ut til å være i utlandet (eller usikker via butikk-/hotell-WiFi). Velg kommune manuelt fra menyen.'
      }
      return
    }

    const result = await selectKommuneByName(geoResult.kommune)
    if (result) {
      isTurposterOpen.value = false
    } else if (showFeedback) {
      turError.value = `Fant ingen registrerte turposter for ${geoResult.kommune}. Velg kommune manuelt fra menyen.`
    }
  } catch (err: any) {
    console.warn('Kunne ikke finne lokal kommune:', err)
  } finally {
    isLoadingLocalTurposter.value = false
  }
}

const handleShowLocalTurposter = async () => {
  let loc = coords.value
  if (!loc) {
    loc = await getCurrentPosition()
  }
  if (!loc) {
    geoError.value = 'Kunne ikke hente din posisjon for å finne kommunen din.'
    return
  }
  await loadLocalTurposterForLocation(loc, true)
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

// Last hierarki og forsøk automatisk å hente brukerens geolokasjon og lokale turposter ved oppstart
onMounted(async () => {
  loadHierarchy()
  try {
    const loc = await getCurrentPosition({ timeout: 5000, enableHighAccuracy: true })
    if (loc) {
      hasLoadedDefaultTurposter.value = true
      await loadLocalTurposterForLocation(loc, false)
    }
  } catch {
    // Hvis brukeren ikke gir tilgang eller posisjon feiler/timer ut ved oppstart, ikke vis feilbanner
    geoError.value = null
  }
})

// Dersom posisjonen blir tilgjengelig litt etter oppstart (f.eks. bruker godkjenner i nettleser-dialog)
watch(
  coords,
  (newCoords) => {
    if (newCoords && !hasLoadedDefaultTurposter.value && !selectedKommune.value) {
      hasLoadedDefaultTurposter.value = true
      loadLocalTurposterForLocation(newCoords, false)
    }
  }
)

onUnmounted(() => {
  stopAisPoll()
})
</script>

<template>
  <main class="app-root">

    <!-- Banner når brukeren skal klikke i kartet for å legge til turpost -->
    <div v-if="isAddSpotModeActive" class="add-spot-banner">
      <span>📍 Klikk hvor som helst i kartet for å plassere turposten</span>
      <button class="btn-cancel-add-spot" @click="isAddSpotModeActive = false">✕ Avbryt</button>
    </div>

    <MapViewer
      ref="mapViewerRef"
      :user-location="coords"
      :active-layer="activeLayer"
      :is-tracking="isTracking"
      :track-points="displayedTrackPoints"
      :turposter="turposter"
      :private-turposter="mySpots"
      :is-add-spot-active="isAddSpotModeActive"
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
      @delete-private-spot="handleDeletePrivateSpot"
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
      :my-spots-count="mySpots.length"
      :is-my-spots-open="isMySpotsOpen"
      :is-add-spot-mode-active="isAddSpotModeActive"
      @locate="handleLocate"
      @toggle-tracking="handleToggleTracking"
      @clear-track="clearTrack"
      @open-track-modal="isTrackModalOpen = true"
      @open-saved-tracks="isSavedTracksOpen = !isSavedTracksOpen"
      @open-my-spots="isMySpotsOpen = true"
      @toggle-add-spot-mode="isAddSpotModeActive = !isAddSpotModeActive"
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
      :matching-private-spot="activeMatchingPrivateSpot"
      :is-logged-in="isLoggedIn"
      :has-visited="activeViewCheckinsPost ? visitedTurpostIds.has(String(activeViewCheckinsPost.id)) : false"
      :current-user-id="user?.userId"
      :user-location="coords"
      :initial-tab="activeViewCheckinsTab"
      @close="activeViewCheckinsPost = null; activeMatchingPrivateSpot = null; activeViewCheckinsTab = undefined"
      @open-checkin="(post: TurpostItem) => { activeViewCheckinsPost = null; activeCheckinPost = post }"
      @private-checkin-deleted="loadMyCheckins"
      @delete-private-spot="handleDeletePrivateSpot"
      @checkin-deleted="loadMyCheckins"
      @checkin-updated="loadMyCheckins"
    />

    <!-- Profilvisning med brukerens innsjekkede turposter og utlogging -->
    <UserProfileModal
      :is-open="isProfileOpen"
      :user="user"
      :checkins="myCheckins"
      :is-admin="isAdmin"
      :is-admin-mode-active="adminModeActive"
      :saved-tracks-count="trackStore.savedTracks.length"
      :my-spots-count="mySpots.length"
      :spot-suggestions-count="spotSuggestionsCount"
      :friends-count="friends.length"
      :pending-friend-requests-count="incomingRequests.length"
      @close="isProfileOpen = false"
      @logout="handleLogoutFromProfile"
      @toggle-admin-mode="handleToggleAdminMode"
      @open-saved-tracks="isSavedTracksOpen = true"
      @open-my-spots="isMySpotsOpen = true"
      @open-spot-suggestions="isSpotSuggestionsOpen = true"
      @open-friends="isFriendsOpen = true"
      @checkin-deleted="loadMyCheckins"
      @checkin-updated="loadMyCheckins"
    />

    <!-- Venner og synlighetsinnstillinger -->
    <FriendsModal
      :is-open="isFriendsOpen"
      :current-user="user"
      @close="isFriendsOpen = false"
    />

    <!-- Mine turposter modal -->
    <MySpotsModal
      :is-open="isMySpotsOpen"
      :spots="mySpots"
      :is-loading="isMySpotsLoading"
      @close="isMySpotsOpen = false"
      @view-spot="handleViewSpotOnMap"
      @delete-spot="handleDeletePrivateSpot"
      @add-spot-click="isAddSpotModeActive = true"
      @suggest-public="handleSuggestExistingSpotForPublic"
      @view-checkins="(spot: TurpostItem) => handleViewCheckins(spot, 'private')"
    />

    <!-- Innkommende forslag til turposter (kun admin) -->
    <SpotSuggestionsModal
      v-if="isAdmin"
      :is-open="isSpotSuggestionsOpen"
      @close="handleCloseSpotSuggestions"
      @view-spot="handleViewSpotOnMap"
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
      :is-logged-in="isLoggedIn"
      @close="isSavedTracksOpen = false"
      @view-track="handleViewSavedTrack"
      @open-live-track-modal="isTrackModalOpen = true"
    />

    <!-- Admin / Bruker: Legg til ny turpost -->
    <AdminAddTurpostModal
      v-if="adminModeActive || isAddSpotModeActive"
      :is-open="!!adminClickCoords"
      :lat="adminClickCoords?.lat ?? 0"
      :lng="adminClickCoords?.lng ?? 0"
      :is-admin="adminModeActive"
      :user-id="user?.userId"
      :user-name="user?.userName"
      :user-email="user?.email"
      @close="adminClickCoords = null; isAddSpotModeActive = false"
      @spot-saved="handleSpotSaved"
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

.add-spot-banner {
  position: absolute;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
  background: #0f172a;
  border: 2px solid #a855f7;
  border-radius: 30px;
  padding: 8px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  color: #f8fafc;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.btn-cancel-add-spot {
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
  border-radius: 20px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-cancel-add-spot:hover {
  background: #ef4444;
  color: #ffffff;
}
</style>
