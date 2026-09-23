import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FirebaseCheckinItem } from '@/composables/useAuth'
import type { TurpostItem } from '@/composables/useTurposter'
import type { SpotSuggestion } from '@/composables/usePrivateTurposter'
import type { SavedTrack } from '@/stores/gpsTrack'

export const useAppStateStore = defineStore('appState', () => {
  const flyToCheckin = ref<FirebaseCheckinItem | null>(null)
  const flyToSpot = ref<TurpostItem | SpotSuggestion | null>(null)
  const viewTrack = ref<SavedTrack | null>(null)
  const viewCheckins = ref<{ post: TurpostItem; tab?: 'public' | 'private' } | null>(null)

  const myCheckins = ref<FirebaseCheckinItem[]>([])
  const mySpots = ref<TurpostItem[]>([])
  const isMySpotsLoading = ref(false)
  const spotSuggestionsCount = ref(0)
  const adminModeActive = ref(false)
  const isAddSpotModeActive = ref(false)
  const clearSpotSuggestionTrigger = ref(0)

  function requestClearSpotSuggestion() {
    clearSpotSuggestionTrigger.value++
  }

  function requestFlyToCheckin(checkin: FirebaseCheckinItem) {
    flyToCheckin.value = checkin
  }

  function clearFlyToCheckin() {
    flyToCheckin.value = null
  }

  function requestFlyToSpot(spot: TurpostItem | SpotSuggestion) {
    flyToSpot.value = spot
  }

  function clearFlyToSpot() {
    flyToSpot.value = null
  }

  function requestViewTrack(track: SavedTrack | null) {
    viewTrack.value = track
  }

  function clearViewTrack() {
    viewTrack.value = null
  }

  function requestViewCheckins(post: TurpostItem, tab?: 'public' | 'private') {
    viewCheckins.value = { post, tab }
  }

  function clearViewCheckins() {
    viewCheckins.value = null
  }

  function toggleAdminMode(isAdmin: boolean) {
    if (isAdmin) {
      adminModeActive.value = !adminModeActive.value
    }
  }

  return {
    flyToCheckin,
    flyToSpot,
    viewTrack,
    viewCheckins,
    myCheckins,
    mySpots,
    isMySpotsLoading,
    spotSuggestionsCount,
    adminModeActive,
    isAddSpotModeActive,
    clearSpotSuggestionTrigger,
    requestClearSpotSuggestion,
    requestFlyToCheckin,
    clearFlyToCheckin,
    requestFlyToSpot,
    clearFlyToSpot,
    requestViewTrack,
    clearViewTrack,
    requestViewCheckins,
    clearViewCheckins,
    toggleAdminMode
  }
})
