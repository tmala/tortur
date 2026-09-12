<script setup lang="ts">
import { useRouter } from 'vue-router'
import SpotSuggestionsModal from '@/components/SpotSuggestionsModal.vue'
import type { TurpostItem } from '@/composables/useTurposter'
import type { SpotSuggestion } from '@/composables/usePrivateTurposter'
import { useAppStateStore } from '@/stores/appState'

const router = useRouter()
const appState = useAppStateStore()

const handleClose = () => {
  router.push('/')
}

const handleViewSpot = (spot: TurpostItem | SpotSuggestion) => {
  appState.requestFlyToSpot(spot)
  router.push('/')
}
</script>

<template>
  <SpotSuggestionsModal
    :is-open="true"
    @close="handleClose"
    @view-spot="handleViewSpot"
  />
</template>
