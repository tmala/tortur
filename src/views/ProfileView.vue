<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UserProfileMenu from '@/components/UserProfileMenu.vue'
import GpsTrackModal from '@/components/GpsTrackModal.vue'
import { useAuth, type FirebaseCheckinItem } from '@/composables/useAuth'
import { useFriends, type FriendUser } from '@/composables/useFriends'
import { usePrivateTurposter } from '@/composables/usePrivateTurposter'
import { useGeolocation } from '@/composables/useGeolocation'
import { useGpsTrackStore, type SavedTrack } from '@/stores/gpsTrack'
import { useAppStateStore } from '@/stores/appState'
import type { TurpostItem } from '@/composables/useTurposter'
import type { ProfileTab } from '@/types/profile'

const route = useRoute()
const router = useRouter()
const { user, isAdmin, logout, fetchMyCheckins } = useAuth()
const { friends, incomingRequests } = useFriends()
const {
  deleteMySpot,
  suggestExistingSpotForPublic,
  fetchMySpots,
  fetchSpotSuggestions,
  fetchMyPrivateCheckins,
} = usePrivateTurposter()
const { trackPoints, isTracking, startTracking, stopTracking, clearTrack } = useGeolocation()
const trackStore = useGpsTrackStore()
const appState = useAppStateStore()

const showLiveModal = ref(false)

const currentTab = computed<ProfileTab>(() => {
  const p = route.path
  if (p.includes('/spor') || p.includes('gps-spor')) return 'tracks'
  if (p.includes('/turposter') || p.includes('mine-turposter')) return 'spots'
  if (p.includes('/venner')) return 'friends'
  return 'checkins'
})

onMounted(() => {
  if (route.query.tab === 'live') {
    showLiveModal.value = true
  }
  if (user.value) {
    // Sørg for at private turposter og forslag er lastet
    fetchMySpots(user.value.userId).then((spots) => {
      appState.mySpots = spots
    })
    if (isAdmin.value) {
      fetchSpotSuggestions().then((sugg) => {
        appState.spotSuggestionsCount = sugg.length
      })
    }
  }
})

watch(
  () => route.query.tab,
  (tab) => {
    if (tab === 'live') {
      showLiveModal.value = true
    }
  },
)

const handleTabChange = (tab: ProfileTab) => {
  if (tab === 'checkins') {
    if (route.path !== '/profil') router.replace('/profil')
  } else if (tab === 'tracks') {
    if (route.path !== '/profil/spor') router.replace('/profil/spor')
  } else if (tab === 'spots') {
    if (route.path !== '/profil/turposter') router.replace('/profil/turposter')
  } else if (tab === 'friends') {
    if (route.path !== '/profil/venner') router.replace('/profil/venner')
  }
}

const handleClose = () => {
  router.push('/')
}

const handleLogout = () => {
  logout()
  router.push('/')
}

const handleToggleAdminMode = () => {
  appState.toggleAdminMode(isAdmin.value)
}

const reloadCheckins = async () => {
  if (!user.value) return
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
    console.warn('[ProfileView] Kunne ikke laste innsjekkinger:', err)
  }
}

const handleViewTurpostOnMap = (checkin: FirebaseCheckinItem) => {
  appState.requestFlyToCheckin(checkin)
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

const handleViewSpot = (spot: TurpostItem) => {
  appState.requestFlyToSpot(spot)
  router.push('/')
}

const handleDeleteSpot = async (spotId: string) => {
  if (!user.value) return
  try {
    await deleteMySpot(user.value.userId, spotId)
    appState.mySpots = appState.mySpots.filter((s) => s.id !== spotId)
  } catch (err) {
    console.warn('[ProfileView] Kunne ikke slette privat turpost:', err)
  }
}

const handleAddSpotClick = () => {
  appState.isAddSpotModeActive = true
  router.push('/')
}

const handleSuggestPublic = async (spot: TurpostItem) => {
  if (!user.value) return
  try {
    await suggestExistingSpotForPublic(user.value.userId, spot, {
      name: user.value.userName || 'Ukjent bruker',
      email: user.value.email || '',
    })
    alert(`Forslag om å gjøre «${spot.name}» til en offentlig turpost er sendt inn!`)
    appState.mySpots = await fetchMySpots(user.value.userId)
    if (isAdmin.value) {
      const suggestions = await fetchSpotSuggestions()
      appState.spotSuggestionsCount = suggestions.length
    }
  } catch (err: unknown) {
    console.warn('[ProfileView] Kunne ikke foreslå turpost som offentlig:', err)
    const errorMessage = err instanceof Error ? err.message : 'Ukjent feil'
    alert('Kunne ikke sende inn forslag: ' + errorMessage)
  }
}

const handleViewCheckins = (spot: TurpostItem) => {
  appState.requestViewCheckins(spot, 'private')
  router.push('/')
}

const handleViewFriendProfile = (friend: FriendUser) => {
  router.push(`/venner/${friend.userId}`)
}
</script>

<template>
  <div>
    <UserProfileMenu
      :is-open="true"
      :active-tab="currentTab"
      :user="user"
      :checkins="appState.myCheckins"
      :is-admin="isAdmin"
      :is-admin-mode-active="appState.adminModeActive"
      :saved-tracks-count="trackStore.savedTracks.length"
      :my-spots-count="appState.mySpots.length"
      :spot-suggestions-count="appState.spotSuggestionsCount"
      :friends-count="friends.length"
      :pending-friend-requests-count="incomingRequests.length"
      :spots="appState.mySpots"
      :is-my-spots-loading="appState.isMySpotsLoading"
      :live-track-points="trackPoints"
      :is-tracking="isTracking"
      :highlighted-track-id="(route.query.trackId as string) || null"
      @tab-change="handleTabChange"
      @close="handleClose"
      @logout="handleLogout"
      @toggle-admin-mode="handleToggleAdminMode"
      @open-spot-suggestions="router.push('/forslag')"
      @checkin-deleted="reloadCheckins"
      @checkin-updated="reloadCheckins"
      @view-turpost-on-map="handleViewTurpostOnMap"
      @view-track="handleViewTrack"
      @open-live-track-modal="showLiveModal = true"
      @view-spot="handleViewSpot"
      @delete-spot="handleDeleteSpot"
      @add-spot-click="handleAddSpotClick"
      @suggest-public="handleSuggestPublic"
      @view-checkins="handleViewCheckins"
      @view-friend-profile="handleViewFriendProfile"
    />

    <!-- Live spor modal hvis aktivert -->
    <GpsTrackModal
      :is-open="showLiveModal"
      :track-points="trackPoints"
      :is-tracking="isTracking"
      @close="showLiveModal = false"
      @clear-track="clearTrack"
      @toggle-tracking="handleToggleTracking"
      @open-saved-tracks="showLiveModal = false"
    />
  </div>
</template>
