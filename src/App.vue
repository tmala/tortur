<script setup lang="ts">
import { ref, onMounted } from 'vue'
import MapViewer from './components/MapViewer.vue'
import LocationControls from './components/LocationControls.vue'
import TurposterPanel from './components/TurposterPanel.vue'
import { useGeolocation } from './composables/useGeolocation'
import { useTurposter, findKommuneInHierarchy, type TurpostItem, type FylkeInfo, type KommuneInfo } from './composables/useTurposter'

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
const activeLayer = ref<string>('standard')
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
  activeLayer.value = layerId
}

// Nullstill feil
const handleClearError = () => {
  geoError.value = null
  turError.value = null
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
</script>

<template>
  <main class="app-root">
    <MapViewer
      ref="mapViewerRef"
      :user-location="coords"
      :active-layer="activeLayer"
      :is-tracking="isTracking"
      :turposter="turposter"
      :show-municipalities="showMunicipalities"
      :selected-kommune-name="selectedKommune ? selectedKommune.name : null"
      :get-kommune-info="getKommuneInfo"
      @map-dragged="handleMapDragged"
      @coordinates-change="handleCoordinatesChange"
      @select-kommune-by-name="handleSelectKommuneByName"
      @clear-turposter="handleClearAllTurposter"
    />

    <LocationControls
      :user-location="coords"
      :is-locating="isLocating"
      :is-tracking="isTracking"
      :error="geoError || turError"
      :active-layer="activeLayer"
      :center-coords="centerCoords"
      :is-turposter-open="isTurposterOpen"
      :active-kommune-name="selectedKommune ? selectedKommune.name : null"
      :turpost-count="turposter.length"
      :show-municipalities="showMunicipalities"
      @locate="handleLocate"
      @toggle-tracking="handleToggleTracking"
      @change-layer="handleChangeLayer"
      @clear-error="handleClearError"
      @toggle-turposter="handleToggleTurposter"
      @toggle-municipalities="showMunicipalities = !showMunicipalities"
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
</style>
