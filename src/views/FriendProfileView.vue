<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FriendProfileModal from '@/components/FriendProfileModal.vue'
import { useAuth, type FirebaseCheckinItem } from '@/composables/useAuth'
import { useFriends, type FriendUser } from '@/composables/useFriends'
import { useAppStateStore } from '@/stores/appState'

const route = useRoute()
const router = useRouter()
const { user } = useAuth()
const { friends, loadFriends } = useFriends()
const appState = useAppStateStore()

const friendId = computed(() => String(route.params.userId || ''))

const friend = computed<FriendUser>(() => {
  const match = friends.value.find((f) => f.userId === friendId.value)
  if (match) return match
  return {
    userId: friendId.value,
    userName: 'Venn'
  }
})

onMounted(() => {
  if (user.value && friends.value.length === 0) {
    loadFriends(user.value.userId)
  }
})

const handleClose = () => {
  router.push('/venner')
}

const handleViewTurpostOnMap = (checkin: FirebaseCheckinItem) => {
  appState.requestFlyToCheckin(checkin)
  router.push('/')
}
</script>

<template>
  <FriendProfileModal
    :is-open="true"
    :friend="friend"
    :current-user-id="user?.userId"
    @close="handleClose"
    @view-turpost-on-map="handleViewTurpostOnMap"
  />
</template>
