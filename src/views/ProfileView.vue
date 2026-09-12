<script setup lang="ts">
import { useRouter } from 'vue-router'
import UserProfileModal from '@/components/UserProfileModal.vue'
import { useAuth, type FirebaseCheckinItem } from '@/composables/useAuth'
import { useFriends } from '@/composables/useFriends'
import { usePrivateTurposter } from '@/composables/usePrivateTurposter'
import { useGpsTrackStore } from '@/stores/gpsTrack'
import { useAppStateStore } from '@/stores/appState'

const router = useRouter()
const { user, isAdmin, logout, fetchMyCheckins } = useAuth()
const { friends, incomingRequests } = useFriends()
const { fetchMyPrivateCheckins } = usePrivateTurposter()
const trackStore = useGpsTrackStore()
const appState = useAppStateStore()

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
      fetchMyPrivateCheckins(user.value.userId)
    ])
    const privateCheckinIds = new Set(privateCheckins.map(c => c.id))
    const filteredPublic = publicCheckins.filter(
      c => !privateCheckinIds.has(c.id) && !String(c.turpostId).startsWith('spot_')
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
</script>

<template>
  <UserProfileModal
    :is-open="true"
    :user="user"
    :checkins="appState.myCheckins"
    :is-admin="isAdmin"
    :is-admin-mode-active="appState.adminModeActive"
    :saved-tracks-count="trackStore.savedTracks.length"
    :my-spots-count="appState.mySpots.length"
    :spot-suggestions-count="appState.spotSuggestionsCount"
    :friends-count="friends.length"
    :pending-friend-requests-count="incomingRequests.length"
    @close="handleClose"
    @logout="handleLogout"
    @toggle-admin-mode="handleToggleAdminMode"
    @open-saved-tracks="router.push('/gps-spor')"
    @open-my-spots="router.push('/mine-turposter')"
    @open-spot-suggestions="router.push('/forslag')"
    @open-friends="router.push('/venner')"
    @checkin-deleted="reloadCheckins"
    @checkin-updated="reloadCheckins"
    @view-turpost-on-map="handleViewTurpostOnMap"
  />
</template>
