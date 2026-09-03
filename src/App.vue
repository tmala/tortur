<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import MapViewer from './components/MapViewer.vue'
import LocationControls from './components/LocationControls.vue'
import TurposterPanel from './components/TurposterPanel.vue'
import AuthPanel from './components/AuthPanel.vue'
import { useGeolocation } from './composables/useGeolocation'
import { useTurposter, findKommuneInHierarchy, type TurpostItem, type FylkeInfo, type KommuneInfo } from './composables/useTurposter'
import { useAis } from './composables/useAis'
import { useAuth } from './composables/useAuth'

const {
  isLocating,
  isTracking,
  error: geoError,
  coords,
  getCurrentPosition,
  startTracking,
  stopTracking
} = useGeolocation()

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

const { isLoggedIn, aisClientId, aisClientSecret } = useAuth()
const activeLayer = ref<string>('standard')

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
      // Hvis aktivt kartlag er et Google-kartlag ved utlogging, bytt tilbake til standard
      if (activeLayer.value.startsWith('google_')) {
        activeLayer.value = 'standard'
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
  toggleAis()
  if (isAisToggled.value && lastMapBounds.value) {
    fetchVessels(lastMapBounds.value, lastMapZoom.value)
    startAisPoll()
  } else {
    stopAisPoll()
  }
}

// Start/stopp poll automatisk dersom AIS blir slått av utenfra
watch(isAisToggled, (enabled) => {
  if (enabled) {
    startAisPoll()
  } else {
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
const showMunicipalities = ref(true)

// Håndter åpning og lukking av turpost-panel
const handleToggleTurposter = () => {
  isTurposterOpen.value = !isTurposterOpen.value
  if (isTurposterOpen.value) {
    loadHierarchy()
  }
}

const handleSelectFylke = (fylke: FylkeInfo | null) => {
  selectFylke(fylke)
}

const handleSelectKommune = (kommune: KommuneInfo | null) => {
  selectKommune(kommune)
}

// Når brukeren velger "Vis turposter" i popupen på kartet
const handleSelectKommuneByName = async (kommuneName: string) => {
  const result = await selectKommuneByName(kommuneName)
  if (result) {
    isTurposterOpen.value = true
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
    if (location && mapViewerRef.value) {
      mapViewerRef.value.centerOnUser(true, 16)
    }
  } catch (err) {
    console.warn('Kunne ikke hente posisjon:', err)
  }
}

// Håndter "Gå til koordinat"
const handleGoToCoordinate = (coordsData: { lat: number; lng: number }) => {
  if (mapViewerRef.value) {
    mapViewerRef.value.panToCoordinate(coordsData.lat, coordsData.lng, 14)
  }
}

// Håndter live sporing / "Følg meg"
const handleToggleTracking = () => {
  if (isTracking.value) {
    stopTracking()
  } else {
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

// Hvis brukeren drar manuelt i kartet, pause "følg meg"-modus
const handleMapDragged = () => {
  if (isTracking.value) {
    stopTracking()
  }
}

// Kartlagbytte
const handleChangeLayer = (layerId: string) => {
  if (layerId.startsWith('google_') && !isLoggedIn.value) {
    activeLayer.value = 'standard'
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
    if (loc && mapViewerRef.value) {
      mapViewerRef.value.centerOnUser(true, 15)
    }
  } catch {
    // Hvis brukeren ikke gir tilgang, forblir kartet elegant på Bergen
  }
})

onUnmounted(() => {
  stopAisPoll()
})

const logoUrl = `${import.meta.env.BASE_URL}icon.svg`
const appVersion = __APP_VERSION__
const appTitle = 'TorTur'
</script>

<template>
  <main class="app-root">
    <!-- Topp venstre hjørne: App Logo, Navn, Versjonsnummer og Login-knapp -->
    <header class="app-top-left-panel">
      <div class="brand-badge">
        <img :src="logoUrl" alt="TorTur logo" class="brand-logo-img" />
        <div class="brand-title-wrap">
          <span class="brand-title">{{ appTitle }}</span>
          <span class="brand-version">v{{ appVersion }}</span>
        </div>
      </div>

      <div class="brand-divider" />

      <AuthPanel />
    </header>

    <MapViewer
      ref="mapViewerRef"
      :user-location="coords"
      :active-layer="activeLayer"
      :is-tracking="isTracking"
      :turposter="turposter"
      :show-municipalities="showMunicipalities"
      :selected-kommune-name="selectedKommune ? selectedKommune.name : null"
      :get-kommune-info="getKommuneInfo"
      :vessels="vessels"
      :is-ais-toggled="isAisToggled"
      :is-zoom-sufficient="isZoomSufficient"
      @map-dragged="handleMapDragged"
      @coordinates-change="handleCoordinatesChange"
      @bounds-change="handleBoundsChange"
      @select-kommune-by-name="handleSelectKommuneByName"
      @clear-turposter="handleClearAllTurposter"
    />

    <LocationControls
      :user-location="coords"
      :is-locating="isLocating"
      :is-tracking="isTracking"
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
      @locate="handleLocate"
      @toggle-tracking="handleToggleTracking"
      @change-layer="handleChangeLayer"
      @clear-error="handleClearError"
      @toggle-turposter="handleToggleTurposter"
      @toggle-municipalities="showMunicipalities = !showMunicipalities"
      @toggle-ais="handleToggleAis"
      @go-to-coordinate="handleGoToCoordinate"
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
      @close="isTurposterOpen = false"
      @select-fylke="handleSelectFylke"
      @select-kommune="handleSelectKommune"
      @update:search-query="searchQuery = $event"
      @focus-post="handleFocusPost"
      @clear-all="handleClearAllTurposter"
    />
  </main>
</template>

<style scoped>
.app-root {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: #0f172a;
}

/* Topp venstre panel: Logo, tittel, versjon og login */
.app-top-left-panel {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 1100;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px 6px 8px;
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.brand-badge {
  display: flex;
  align-items: center;
  gap: 9px;
}

.brand-logo-img {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  object-fit: cover;
  box-shadow: 0 2px 8px rgba(2, 132, 199, 0.4);
}

.brand-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.brand-title {
  font-size: 15px;
  font-weight: 700;
  color: #f8fafc;
  letter-spacing: -0.01em;
}

.brand-version {
  font-size: 10px;
  font-weight: 600;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.brand-divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.15);
  margin: 0 2px;
}

@media (max-width: 640px) {
  .app-top-left-panel {
    top: 10px;
    left: 10px;
    padding: 5px 10px 5px 6px;
    gap: 8px;
  }
  .brand-logo-img {
    width: 28px;
    height: 28px;
  }
  .brand-version {
    display: none;
  }
}
</style>
