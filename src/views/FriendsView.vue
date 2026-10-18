<script setup lang="ts">
import { useRouter } from 'vue-router'
import FriendsMenu from '@/components/FriendsMenu.vue'
import { useAuth } from '@/composables/useAuth'
import type { FriendUser } from '@/composables/useFriends'

const router = useRouter()
const { user } = useAuth()

const handleClose = () => {
  router.push('/')
}

const handleViewFriendProfile = (friend: FriendUser) => {
  router.push(`/venner/${friend.userId}`)
}
</script>

<template>
  <FriendsMenu
    :is-open="true"
    :current-user="user"
    @close="handleClose"
    @view-friend-profile="handleViewFriendProfile"
  />
</template>
