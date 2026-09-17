<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import MapViewer from '@/components/MapViewer.vue'
import AppHeader from '@/components/AppHeader.vue'
import TrackPlaybackPanel from '@/components/TrackPlaybackPanel.vue'
import LocationControls from '@/components/LocationControls.vue'
import TurposterPanel from '@/components/TurposterPanel.vue'
import CheckinModal from '@/components/CheckinModal.vue'
import TurpostCheckinsModal from '@/components/TurpostCheckinsModal.vue'
import AddTurpostModal from '@/components/AddTurpostModal.vue'
import {
  useGeolocation,
  calculateDistanceMeters,
  type GeoLocationState,
} from '@/composables/useGeolocation'
import { X as CloseIcon } from 'lucide-vue-next'
import { useTrackPhotos, type TrackPhoto, isPhotoNearTrack } from '@/composables/useTrackPhotos'
import { formatTrackKey } from '@/composables/useFirebaseTracks'
import {
  useTurposter,
  findKommuneInHierarchy,
  type TurpostItem,
  type FylkeInfo,
  type KommuneInfo,
} from '@/composables/useTurposter'
import { usePrivateTurposter, type SpotSuggestion } from '@/composables/usePrivateTurposter'
import { useAis } from '@/composables/useAis'
import { useAuth, type FirebaseCheckinItem, type CheckinResult } from '@/composables/useAuth'
import { useFriends } from '@/composables/useFriends'
import { useGeoDetect } from '@/composables/useGeoDetect'
import { useGpsTrackStore, type SavedTrack } from '@/stores/gpsTrack'
import { useAppUpdate } from '@/composables/useAppUpdate'
import { useAppStateStore } from '@/stores/appState'

const router = useRouter()
const appState = useAppStateStore()

const {
  isLocating,
  isTracking,
  error: geoError,
  coords,
  trackPoints,
  getCurrentPosition,
  startTracking,
  stopTracking,
  clearTrack,
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
  clearError: clearAisError,
} = useAis()

const { user, isLoggedIn, isAdmin, aisClientId, aisClientSecret, fetchMyCheckins } = useAuth()
const { registerPublicUser, loadFriends, loadFriendRequests, loadDefaultVisibility } = useFriends()
const { needsUpdate, applyUpdate } = useAppUpdate()
const activeLayer = ref<string>('norgeskart')
const activeCheckinPost = ref<TurpostItem | null>(null)
const activeViewCheckinsPost = ref<TurpostItem | null>(null)

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
  { immediate: true },
)

// Private turposter (my_spots) og innkommende forslag
const { fetchMySpots, deleteMySpot, fetchMyPrivateCheckins, fetchSpotSuggestions } =
  usePrivateTurposter()

// Bruker / Admin: ny turpost (kart-klikk)
const addTurpostClickCoords = ref<{ lat: number; lng: number } | null>(null)

function handleAddTurpostMapClick(coords: { lat: number; lng: number }) {
  if (addTurpostClickCoords.value) return
  addTurpostClickCoords.value = coords
}

const loadMySpots = async () => {
  if (!isLoggedIn.value || !user.value) {
    appState.mySpots = []
    return
  }
  try {
    appState.isMySpotsLoading = true
    appState.mySpots = await fetchMySpots(user.value.userId)
  } catch (err) {
    console.warn('[MapView] Kunne ikke laste brukerens private turposter:', err)
  } finally {
    appState.isMySpotsLoading = false
  }
}

const loadSpotSuggestions = async () => {
  if (!isAdmin.value) return
  try {
    const list = await fetchSpotSuggestions()
    appState.spotSuggestionsCount = list.length
  } catch (err) {
    console.warn('[MapView] Kunne ikke hente forslag:', err)
  }
}

function handleSpotSaved(spot: TurpostItem) {
  appState.mySpots = [spot, ...appState.mySpots.filter((s) => s.id !== spot.id)]
  appState.isAddSpotModeActive = false
  addTurpostClickCoords.value = null
  if (isAdmin.value) {
    loadSpotSuggestions()
  }
}

async function handleDeletePrivateSpot(spotId: string) {
  if (!user.value) return
  try {
    await deleteMySpot(user.value.userId, spotId)
    appState.mySpots = appState.mySpots.filter((s) => s.id !== spotId)
    await loadMyCheckins()
  } catch (err) {
    console.warn('[MapView] Kunne ikke slette privat turpost:', err)
  }
}

function handleViewSpotOnMap(spot: TurpostItem | SpotSuggestion) {
  if (!mapViewerRef.value) return
  if ((spot as TurpostItem).isPrivate) {
    mapViewerRef.value.flyToPost(spot as TurpostItem)
  } else if ('suggestedAt' in spot) {
    mapViewerRef.value.showSpotSuggestion(spot as SpotSuggestion)
  } else {
    mapViewerRef.value.flyToPost(spot as TurpostItem)
  }
}

// Brukerens egne innsjekkinger fra Firebase (både offentlige og private)
const visitedTurpostIds = computed(
  () => new Set(appState.myCheckins.map((c) => String(c.turpostId))),
)

const loadMyCheckins = async () => {
  if (!isLoggedIn.value || !user.value) {
    appState.myCheckins = []
    return
  }
  try {
    const [publicCheckins, privateCheckins] = await Promise.all([
      fetchMyCheckins(),
      fetchMyPrivateCheckins(user.value.userId),
    ])
    const privateCheckinIds = new Set(privateCheckins.map((c) => c.id))
    const filteredPublic = publicCheckins.filter(
      (c) => !privateCheckinIds.has(c.id) && !String(c.turpostId).startsWith('spot_'),
    )
    appState.myCheckins = [...filteredPublic, ...privateCheckins]
  } catch (err) {
    console.warn('[MapView] Kunne ikke laste brukerens innsjekkinger:', err)
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
      appState.myCheckins = []
      appState.mySpots = []
      appState.spotSuggestionsCount = 0
    }
  },
  { immediate: true },
)

const handleOpenCheckin = (post: TurpostItem) => {
  activeCheckinPost.value = post
}

const activeMatchingPrivateSpot = ref<TurpostItem | null>(null)
const activeViewCheckinsTab = ref<'public' | 'private' | undefined>(undefined)

const handleViewCheckins = (
  post: TurpostItem,
  initialTab?: 'public' | 'private',
  matchingPrivate?: TurpostItem | null,
) => {
  activeViewCheckinsPost.value = post
  activeViewCheckinsTab.value = initialTab
  activeMatchingPrivateSpot.value =
    matchingPrivate ||
    (!post.isPrivate
      ? appState.mySpots.find(
          (s) =>
            String(s.id) === String(post.id) ||
            calculateDistanceMeters(s.lat, s.lng, post.lat, post.lng) < 15,
        ) || null
      : null)
}

const handleCheckinSubmitted = (result: CheckinResult) => {
  if (result && result.turpostId) {
    appState.myCheckins.push({
      ...result,
      id: result.id || '',
      userName: result.userName || '',
      userAvatar: result.userAvatar || '',
    })
  }
}

const handleSelectTurpost = () => {
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
  { immediate: true },
)

const lastMapBounds = ref<{
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
} | null>(null)
const lastMapZoom = ref<number>(13)

// Periodisk oppdatering av AIS-data hvert 30. sekund
const AIS_POLL_INTERVAL_MS = 30_000
let aisPollTimer: ReturnType<typeof setInterval> | null = null

const startAisPoll = () => {
  if (aisPollTimer) return
  aisPollTimer = setInterval(() => {
    if (isAisToggled.value && lastMapBounds.value) {
      fetchVessels(lastMapBounds.value, lastMapZoom.value, true)
    }
  }, AIS_POLL_INTERVAL_MS)
}

const stopAisPoll = () => {
  if (aisPollTimer) {
    clearInterval(aisPollTimer)
    aisPollTimer = null
  }
}

const handleBoundsChange = (
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  zoom: number,
) => {
  lastMapBounds.value = bounds
  lastMapZoom.value = zoom
  if (isAisToggled.value) {
    fetchVessels(bounds, zoom)
  }
}

const handleToggleAis = () => {
  if (!isEffectiveAdmin.value) return
  toggleAis()
  if (isAisToggled.value && lastMapBounds.value) {
    fetchVessels(lastMapBounds.value, lastMapZoom.value, true)
    startAisPoll()
  } else {
    stopAisPoll()
  }
}

const isEffectiveAdmin = computed(() => isAdmin.value && appState.adminModeActive)

// Start/stopp poll automatisk dersom AIS blir slått av utenfra eller admin deaktiverer admin-modus / logger ut
watch(isAisToggled, (enabled) => {
  if (enabled && isEffectiveAdmin.value) {
    startAisPoll()
  } else {
    stopAisPoll()
  }
})

watch(isEffectiveAdmin, (active) => {
  if (!active && isAisToggled.value) {
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
  lookupTurpost,
  clearSelection,
} = useTurposter()

const mapViewerRef = ref<InstanceType<typeof MapViewer> | null>(null)
const centerCoords = ref<{ lat: number; lng: number; zoom: number } | null>(null)
const isTurposterOpen = ref(false)
const showMunicipalities = ref(false)
const trackStore = useGpsTrackStore()

// Synkroniser innlogget bruker med Pinia-sporene
watch(
  () => user.value?.userId,
  (newUid) => {
    trackStore.setUser(newUid)
  },
  { immediate: true },
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

const displayedTrackTitle = computed(() => {
  if (trackStore.activeTrack) {
    return trackStore.activeTrack.name
  }
  if (trackPoints.value.length > 0) {
    return isTracking.value ? 'Pågående opptak' : 'Aktiv sporlogg'
  }
  return ''
})

const displayedTrackDistance = computed(() => {
  if (trackStore.activeTrack) {
    return trackStore.activeTrack.distanceMeters
  }
  return undefined
})

const handleTrackClick = () => {
  if (trackStore.activeTrack) {
    router.push({ path: '/gps-spor', query: { trackId: trackStore.activeTrack.id } })
  } else if (trackPoints.value.length > 0) {
    router.push({ path: '/gps-spor', query: { tab: 'live' } })
  }
}

const handleViewSavedTrack = (track: SavedTrack | null) => {
  if (track) {
    if (mapViewerRef.value) {
      mapViewerRef.value.zoomToTrack(track.points)
    } else {
      nextTick(() => {
        mapViewerRef.value?.zoomToTrack(track.points)
      })
    }
  }
}

// Zoom til spor når aktivt spor endres (f.eks. valgt fra en innsjekking)
const isReplayingTrack = ref(false)
const replaySpeedOptions = [10, 20, 40, 80, 120, 160]
const currentReplaySpeed = ref(40)

const handleCycleReplaySpeed = () => {
  const currentIndex = replaySpeedOptions.indexOf(currentReplaySpeed.value)
  const nextIndex = (currentIndex + 1) % replaySpeedOptions.length
  currentReplaySpeed.value = replaySpeedOptions[nextIndex]!
  mapViewerRef.value?.setTrackReplaySpeed(currentReplaySpeed.value)
}

const handleIncreaseSpeed = () => {
  const currentIndex = replaySpeedOptions.indexOf(currentReplaySpeed.value)
  if (currentIndex < replaySpeedOptions.length - 1) {
    currentReplaySpeed.value = replaySpeedOptions[currentIndex + 1]!
    mapViewerRef.value?.setTrackReplaySpeed(currentReplaySpeed.value)
  }
}

const handleDecreaseSpeed = () => {
  const currentIndex = replaySpeedOptions.indexOf(currentReplaySpeed.value)
  if (currentIndex > 0) {
    currentReplaySpeed.value = replaySpeedOptions[currentIndex - 1]!
    mapViewerRef.value?.setTrackReplaySpeed(currentReplaySpeed.value)
  }
}

const handlePlayTrackReplay = () => {
  mapViewerRef.value?.startTrackReplay(currentReplaySpeed.value)
  isReplayingTrack.value = true
}

const handlePauseTrackReplay = () => {
  mapViewerRef.value?.pauseTrackReplay()
  isReplayingTrack.value = false
}

const handleStopTrackReplay = () => {
  mapViewerRef.value?.stopTrackReplay()
  isReplayingTrack.value = false
}

const handleTrackReplayChange = (isPlaying: boolean) => {
  isReplayingTrack.value = isPlaying
}

// Visningstilstander for sporet på kartet
const showKmMarkers = ref(true)
const showPhotosOnMap = ref(true)
const activeTrackPhotos = ref<TrackPhoto[]>([])
const selectedPhotoForModal = ref<TrackPhoto | null>(null)

const { fetchTrackPhotos } = useTrackPhotos()

watch(
  () => trackStore.activeTrack,
  async (track) => {
    mapViewerRef.value?.stopTrackReplay()
    isReplayingTrack.value = false
    if (track) {
      handleViewSavedTrack(track)
      if (track.userId && track.userId !== 'guest') {
        const key = track.firebaseKey || formatTrackKey(track.startTime || track.createdAt)
        activeTrackPhotos.value = await fetchTrackPhotos(track.userId, key)
      } else {
        activeTrackPhotos.value = []
      }
    } else {
      activeTrackPhotos.value = []
    }
  },
  { immediate: true },
)

// Beregn turbilder som er på/nær sporet (innenfor 300m)
const onTrackPhotos = computed(() => {
  if (!trackStore.activeTrack || !trackStore.activeTrack.points) return []
  return activeTrackPhotos.value.filter((photo) =>
    isPhotoNearTrack(photo, trackStore.activeTrack!.points, 300)
  )
})

// Bilder som faktisk sendes til kartet
const displayedTrackPhotos = computed(() => {
  if (!showPhotosOnMap.value) return []
  return onTrackPhotos.value
})

const handlePhotoClick = (photo: TrackPhoto) => {
  selectedPhotoForModal.value = photo
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
  if (
    fylke?.slug === 'utlandet' &&
    (activeLayer.value === 'norgeskart' || activeLayer.value === 'kartverket_sjokart')
  ) {
    activeLayer.value = 'standard'
  }
}

const handleSelectKommune = (kommune: KommuneInfo | null) => {
  if (mapViewerRef.value) {
    mapViewerRef.value.resetAutoCenter()
  }
  selectKommune(kommune)
  if (
    selectedFylke.value?.slug === 'utlandet' &&
    (activeLayer.value === 'norgeskart' || activeLayer.value === 'kartverket_sjokart')
  ) {
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
    if (
      result.fylke?.slug === 'utlandet' &&
      (activeLayer.value === 'norgeskart' || activeLayer.value === 'kartverket_sjokart')
    ) {
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
  if (
    selectedFylke.value?.slug === 'utlandet' &&
    (activeLayer.value === 'norgeskart' || activeLayer.value === 'kartverket_sjokart')
  ) {
    activeLayer.value = 'standard'
  }
  if (mapViewerRef.value) {
    mapViewerRef.value.flyToPost(post)
  }
}

const handleViewCheckinOnMap = async (checkin: FirebaseCheckinItem) => {
  if (mapViewerRef.value) {
    mapViewerRef.value.resetAutoCenter()
  }

  // 1. Sjekk om det er en privat turpost / spot
  const isPrivate =
    checkin.isPrivate ||
    !!checkin.spotId ||
    (checkin.turpostId && checkin.turpostId.startsWith('spot_'))
  if (isPrivate) {
    const spot = appState.mySpots.find(
      (s) =>
        s.id === checkin.spotId ||
        s.id === checkin.turpostId ||
        (checkin.turpostName && s.name.toLowerCase() === checkin.turpostName.toLowerCase()),
    )
    if (spot) {
      await checkAndApplyAbroadLayer(spot.lat, spot.lng)
      handleFocusPost(spot)
      return
    }
  }

  // 2. Sjekk om turposten allerede finnes i aktiv kommune (turposter.value)
  const existingInActiveKommune = turposter.value.find(
    (p) =>
      (checkin.turpostId && p.id === checkin.turpostId) ||
      (checkin.turpostName && p.name.toLowerCase() === checkin.turpostName.toLowerCase()),
  )
  if (existingInActiveKommune) {
    await checkAndApplyAbroadLayer(existingInActiveKommune.lat, existingInActiveKommune.lng)
    handleFocusPost(existingInActiveKommune)
    return
  }

  // 3. Slå opp i felles turpostdatabase (mountains.csv)
  const found = await lookupTurpost(checkin.turpostId, checkin.turpostName)
  if (found) {
    await checkAndApplyAbroadLayer(found.lat, found.lng)
    if (found.kommune) {
      await selectKommuneByName(found.kommune)
      await nextTick()
      const inKommune = turposter.value.find((p) => p.id === found.id)
      setTimeout(() => {
        handleFocusPost(inKommune || found)
      }, 100)
    } else {
      handleFocusPost(found)
    }
  } else {
    console.warn('Fant ikke koordinater for turposten:', checkin)
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
  } catch (err) {
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
    startTracking({ enableHighAccuracy: true }, (newCoords) => {
      if (mapViewerRef.value && newCoords) {
        mapViewerRef.value.centerOnUser(true)
      }
    })
  }
}

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

// Watchers for kommunikasjon fra views via appStateStore
watch(
  () => appState.flyToCheckin,
  async (checkin) => {
    if (checkin) {
      await handleViewCheckinOnMap(checkin)
      appState.clearFlyToCheckin()
    }
  },
)

watch(
  () => appState.flyToSpot,
  (spot) => {
    if (spot) {
      handleViewSpotOnMap(spot)
      appState.clearFlyToSpot()
    }
  },
)

watch(
  () => appState.viewTrack,
  (track) => {
    if (track) {
      handleViewSavedTrack(track)
      appState.clearViewTrack()
    }
  },
  { immediate: true },
)

watch(
  () => appState.viewCheckins,
  (val) => {
    if (val) {
      handleViewCheckins(val.post, val.tab)
      appState.clearViewCheckins()
    }
  },
)

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
    geoError.value = null
  }
})

// Dersom posisjonen blir tilgjengelig litt etter oppstart
watch(coords, (newCoords) => {
  if (newCoords && !hasLoadedDefaultTurposter.value && !selectedKommune.value) {
    hasLoadedDefaultTurposter.value = true
    loadLocalTurposterForLocation(newCoords, false)
  }
})

onUnmounted(() => {
  stopAisPoll()
})
</script>

<template>
  <main class="app-root">
    <!-- Banner når brukeren skal klikke i kartet for å legge til turpost -->
    <div v-if="appState.isAddSpotModeActive" class="add-spot-banner">
      <span>📍 Klikk hvor som helst i kartet for å plassere turposten</span>
      <button class="btn-cancel-add-spot" @click="appState.isAddSpotModeActive = false">
        ✕ Avbryt
      </button>
    </div>

    <!-- Flytende sporvisningspanel når et lagret GPS-spor vises på kartet -->
    <transition name="fade-slide">
      <div v-if="trackStore.activeTrack" class="track-control-panel-wrapper">
        <TrackPlaybackPanel
          :track="trackStore.activeTrack"
          :is-replaying="isReplayingTrack"
          :replay-speed="currentReplaySpeed"
          :show-km-markers="showKmMarkers"
          :show-photos-on-map="showPhotosOnMap"
          :on-track-photos-count="onTrackPhotos.length"
          @focus-track="handleViewSavedTrack(trackStore.activeTrack)"
          @close="trackStore.clearActiveTrack()"
          @update:show-km-markers="showKmMarkers = $event"
          @update:show-photos-on-map="showPhotosOnMap = $event"
          @play="handlePlayTrackReplay"
          @pause="handlePauseTrackReplay"
          @increase-speed="handleIncreaseSpeed"
          @decrease-speed="handleDecreaseSpeed"
          @cycle-speed="handleCycleReplaySpeed"
          @stop-replay="handleStopTrackReplay"
        />
      </div>
    </transition>

    <MapViewer
      ref="mapViewerRef"
      :user-location="coords"
      :active-layer="activeLayer"
      :is-tracking="isTracking"
      :track-points="displayedTrackPoints"
      :track-name="displayedTrackTitle"
      :track-distance-meters="displayedTrackDistance"
      :show-km-markers="showKmMarkers"
      :track-photos="displayedTrackPhotos"
      :turposter="turposter"
      :private-turposter="appState.mySpots"
      :is-add-spot-active="appState.isAddSpotModeActive"
      :show-municipalities="showMunicipalities"
      :selected-kommune-name="selectedKommune ? selectedKommune.name : null"
      :get-kommune-info="getKommuneInfo"
      :vessels="vessels"
      :is-ais-toggled="isAisToggled"
      :is-zoom-sufficient="isZoomSufficient"
      :is-logged-in="isLoggedIn"
      :visited-turpost-ids="visitedTurpostIds"
      @map-dragged="handleMapDragged"
      @coordinates-change="handleCoordinatesChange"
      @bounds-change="handleBoundsChange"
      @select-turpost="handleSelectTurpost"
      @checkin-turpost="handleOpenCheckin"
      @view-checkins="handleViewCheckins"
      @select-kommune-by-name="handleSelectKommuneByName"
      @clear-turposter="handleClearAllTurposter"
      @add-turpost-map-click="handleAddTurpostMapClick"
      @delete-private-spot="handleDeletePrivateSpot"
      @click-track="handleTrackClick"
      @click-track-photo="handlePhotoClick"
      @disable-municipalities="showMunicipalities = false"
      @track-replay-change="handleTrackReplayChange"
    />

    <!-- Lightbox Modal for turbilder klikket på kartet -->
    <div
      v-if="selectedPhotoForModal"
      class="lightbox-backdrop"
      @click.self="selectedPhotoForModal = null"
    >
      <div class="lightbox-content">
        <button class="btn-lightbox-close" @click="selectedPhotoForModal = null" aria-label="Lukk bildevisning">
          <CloseIcon :size="20" />
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
              📍 {{ selectedPhotoForModal.lat.toFixed(5) }}, {{ selectedPhotoForModal.lng.toFixed(5) }}
            </span>
            <a
              v-if="selectedPhotoForModal.driveViewUrl"
              :href="selectedPhotoForModal.driveViewUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="lightbox-drive-link"
            >
              Åpne i Google Drive ↗
            </a>
          </div>
        </div>
      </div>
    </div>

    <AppHeader
      :active-layer="activeLayer"
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
      :is-admin-active="appState.adminModeActive"
      :is-loading-local-turposter="isLoadingLocalTurposter"
      :is-locating="isLocating"
      :is-tracking="isTracking"
      :has-track="trackPoints.length > 0"
      :saved-tracks-count="trackStore.savedTracks.length"
      :is-saved-tracks-open="false"
      :needs-update="needsUpdate"
      :my-spots-count="appState.mySpots.length"
      :is-my-spots-open="false"
      :is-add-spot-mode-active="appState.isAddSpotModeActive"
      @locate="handleLocate"
      @toggle-tracking="handleToggleTracking"
      @open-track-modal="router?.push('/gps-spor?tab=live')"
      @open-saved-tracks="router?.push('/gps-spor')"
      @open-my-spots="router?.push('/mine-turposter')"
      @toggle-add-spot-mode="appState.isAddSpotModeActive = !appState.isAddSpotModeActive"
      @change-layer="handleChangeLayer"
      @toggle-turposter="handleToggleTurposter"
      @toggle-municipalities="showMunicipalities = !showMunicipalities"
      @toggle-ais="handleToggleAis"
      @show-local-turposter="handleShowLocalTurposter"
      @open-profile="router?.push('/profil')"
      @apply-update="applyUpdate"
    />

    <LocationControls
      :user-location="coords"
      :center-coords="centerCoords"
      :error="geoError || turError || aisError"
      :is-locating="isLocating"
      @locate="handleLocate"
      @clear-error="handleClearError"
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
      :has-visited="
        activeViewCheckinsPost ? visitedTurpostIds.has(String(activeViewCheckinsPost.id)) : false
      "
      :current-user-id="user?.userId"
      :user-location="coords"
      :initial-tab="activeViewCheckinsTab"
      @close="
        activeViewCheckinsPost = null;
        activeMatchingPrivateSpot = null;
        activeViewCheckinsTab = undefined;
      "
      @open-checkin="
        (post: TurpostItem) => {
          activeViewCheckinsPost = null
          activeCheckinPost = post
        }
      "
      @private-checkin-deleted="loadMyCheckins"
      @delete-private-spot="handleDeletePrivateSpot"
      @checkin-deleted="loadMyCheckins"
      @checkin-updated="loadMyCheckins"
    />

    <!-- Bruker / Admin: Legg til ny turpost -->
    <AddTurpostModal
      v-if="appState.isAddSpotModeActive"
      :is-open="!!addTurpostClickCoords"
      :lat="addTurpostClickCoords?.lat ?? 0"
      :lng="addTurpostClickCoords?.lng ?? 0"
      :is-admin="isEffectiveAdmin"
      :user-id="user?.userId"
      :user-name="user?.userName"
      :user-email="user?.email"
      @close="
        addTurpostClickCoords = null;
        appState.isAddSpotModeActive = false;
      "
      @spot-saved="handleSpotSaved"
    />

    <!-- Undersider rendres som overlay her -->
    <RouterView />
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

.track-control-panel-wrapper {
  position: absolute;
  top: calc(14px + env(safe-area-inset-top, 0px));
  right: calc(14px + env(safe-area-inset-right, 0px));
  z-index: 1060;
  max-width: 380px;
  pointer-events: none;
}

@media (max-width: 640px) {
  .track-control-panel-wrapper {
    top: calc(56px + env(safe-area-inset-top, 0px));
    left: 10px;
    right: 10px;
    max-width: calc(100vw - 20px);
    display: flex;
    justify-content: center;
  }
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.25s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* Lightbox Modal for turbilder */
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
