<script setup lang="ts">
import { useRouter } from 'vue-router'
import MySpotsMenu from '@/components/MySpotsMenu.vue'
import { useAuth } from '@/composables/useAuth'
import { usePrivateTurposter } from '@/composables/usePrivateTurposter'
import type { TurpostItem } from '@/composables/useTurposter'
import { useAppStateStore } from '@/stores/appState'

const router = useRouter()
const { user, isAdmin } = useAuth()
const { deleteMySpot, suggestExistingSpotForPublic, fetchMySpots, fetchSpotSuggestions } = usePrivateTurposter()
const appState = useAppStateStore()

const handleClose = () => {
  router.push('/')
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
    console.warn('[MySpotsView] Kunne ikke slette privat turpost:', err)
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
      email: user.value.email || ''
    })
    alert(`Forslag om å gjøre «${spot.name}» til en offentlig turpost er sendt inn!`)
    appState.mySpots = await fetchMySpots(user.value.userId)
    if (isAdmin.value) {
      const suggestions = await fetchSpotSuggestions()
      appState.spotSuggestionsCount = suggestions.length
    }
  } catch (err: unknown) {
    console.warn('[MySpotsView] Kunne ikke foreslå turpost som offentlig:', err)
    const errorMessage = err instanceof Error ? err.message : 'Ukjent feil'
    alert('Kunne ikke sende inn forslag: ' + errorMessage)
  }
}

const handleViewCheckins = (spot: TurpostItem) => {
  appState.requestViewCheckins(spot, 'private')
  router.push('/')
}
</script>

<template>
  <MySpotsMenu
    :is-open="true"
    :spots="appState.mySpots"
    :is-loading="appState.isMySpotsLoading"
    @close="handleClose"
    @view-spot="handleViewSpot"
    @delete-spot="handleDeleteSpot"
    @add-spot-click="handleAddSpotClick"
    @suggest-public="handleSuggestPublic"
    @view-checkins="handleViewCheckins"
  />
</template>
