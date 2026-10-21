<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  Users,
  UserPlus,
  Search,
  Globe,
  Check,
  AlertCircle,
} from 'lucide-vue-next'
import {
  useFriends,
  type FriendUser,
  type FriendRequest,
  type PublicUser,
  type CheckinVisibility,
} from '@/composables/useFriends'
import type { GoogleUser } from '@/composables/useAuth'
import FriendsListTab from '@/components/friends/FriendsListTab.vue'
import FriendRequestsTab from '@/components/friends/FriendRequestsTab.vue'
import FriendSearchTab from '@/components/friends/FriendSearchTab.vue'
import FriendVisibilityTab from '@/components/friends/FriendVisibilityTab.vue'

const props = defineProps<{
  currentUser: GoogleUser | null
}>()

const emit = defineEmits<{
  (e: 'view-friend-profile', friend: FriendUser): void
}>()

const {
  friends,
  incomingRequests,
  outgoingRequests,
  defaultVisibility,
  isFriend,
  loadFriends,
  loadFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  removeFriend,
  searchPublicUsers,
  loadDefaultVisibility,
  setDefaultVisibility,
} = useFriends()

type TabKey = 'friends' | 'requests' | 'search' | 'settings'
const activeSubTab = ref<TabKey>('friends')

const searchQuery = ref('')
const searchResults = ref<PublicUser[]>([])
const isSearching = ref(false)
const actionLoadingId = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const errorMessage = ref<string | null>(null)

async function initializeData() {
  errorMessage.value = null
  successMessage.value = null
  if (props.currentUser?.userId) {
    await Promise.all([
      loadFriends(props.currentUser.userId),
      loadFriendRequests(props.currentUser.userId),
      loadDefaultVisibility(props.currentUser.userId),
    ])
    if (incomingRequests.value.length > 0 && friends.value.length === 0) {
      activeSubTab.value = 'requests'
    }
  }
}

onMounted(() => {
  initializeData()
})

watch(
  () => props.currentUser?.userId,
  (newId) => {
    if (newId) {
      initializeData()
    }
  },
)

const outgoingTargetIds = computed(() => new Set(outgoingRequests.value.map((r) => r.toUserId)))
const incomingSenderIds = computed(() => new Set(incomingRequests.value.map((r) => r.fromUserId)))

let searchDebounceTimeout: ReturnType<typeof setTimeout> | undefined = undefined
watch(searchQuery, () => {
  clearTimeout(searchDebounceTimeout)
  searchDebounceTimeout = setTimeout(() => {
    if (activeSubTab.value === 'search') {
      handleSearch()
    }
  }, 300)
})

async function handleSearch() {
  if (!props.currentUser) return
  isSearching.value = true
  errorMessage.value = null
  try {
    const users = await searchPublicUsers(searchQuery.value)
    searchResults.value = users.filter((u) => u.userId !== props.currentUser?.userId)
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'Kunne ikke søke etter brukere'
  } finally {
    isSearching.value = false
  }
}

function openSearchTab() {
  activeSubTab.value = 'search'
  handleSearch()
}

function clearSearch() {
  searchQuery.value = ''
  searchResults.value = []
}

async function handleSendRequest(targetUser: PublicUser) {
  if (!props.currentUser) return
  actionLoadingId.value = targetUser.userId
  errorMessage.value = null
  try {
    await sendFriendRequest(props.currentUser, targetUser)
    successMessage.value = `Venneforespørsel sendt til ${targetUser.userName}!`
    setTimeout(() => {
      successMessage.value = null
    }, 3500)
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'Kunne ikke sende forespørsel'
  } finally {
    actionLoadingId.value = null
  }
}

async function handleAccept(request: FriendRequest) {
  if (!props.currentUser) return
  actionLoadingId.value = request.fromUserId
  errorMessage.value = null
  try {
    await acceptFriendRequest(props.currentUser, request)
    successMessage.value = `Du er nå venn med ${request.userName}!`
    setTimeout(() => {
      successMessage.value = null
    }, 3500)
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'Kunne ikke godta forespørsel'
  } finally {
    actionLoadingId.value = null
  }
}

async function handleReject(fromUserId: string) {
  if (!props.currentUser) return
  actionLoadingId.value = fromUserId
  errorMessage.value = null
  try {
    await rejectFriendRequest(props.currentUser.userId, fromUserId)
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'Kunne ikke avvise forespørsel'
  } finally {
    actionLoadingId.value = null
  }
}

async function handleCancel(targetUserId: string) {
  if (!props.currentUser) return
  actionLoadingId.value = targetUserId
  errorMessage.value = null
  try {
    await cancelFriendRequest(props.currentUser.userId, targetUserId)
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'Kunne ikke avbryte forespørsel'
  } finally {
    actionLoadingId.value = null
  }
}

async function handleRemoveFriend(friend: FriendUser) {
  if (!props.currentUser) return
  if (!confirm(`Er du sikker på at du vil fjerne ${friend.userName} som venn?`)) return

  actionLoadingId.value = friend.userId
  errorMessage.value = null
  try {
    await removeFriend(props.currentUser.userId, friend.userId)
    successMessage.value = `${friend.userName} er fjernet som venn`
    setTimeout(() => {
      successMessage.value = null
    }, 3500)
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'Kunne ikke fjerne venn'
  } finally {
    actionLoadingId.value = null
  }
}

async function handleSetVisibility(visibility: CheckinVisibility) {
  if (!props.currentUser) return
  errorMessage.value = null
  try {
    await setDefaultVisibility(props.currentUser.userId, visibility)
    successMessage.value = 'Standard synlighet er oppdatert!'
    setTimeout(() => {
      successMessage.value = null
    }, 3000)
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'Kunne ikke lagre innstilling'
  }
}
</script>

<template>
  <div class="profile-friends-tab">
    <!-- Tilbakemeldinger -->
    <transition name="msg-fade">
      <div v-if="successMessage" class="feedback-banner success">
        <Check :size="16" />
        <span>{{ successMessage }}</span>
      </div>
    </transition>
    <transition name="msg-fade">
      <div v-if="errorMessage" class="feedback-banner error">
        <AlertCircle :size="16" />
        <span>{{ errorMessage }}</span>
      </div>
    </transition>

    <!-- Sekundære under-faner (Sub-navigasjon) -->
    <div class="friends-sub-bar" role="tablist" aria-label="Venner undermenyer">
      <button
        type="button"
        role="tab"
        :aria-selected="activeSubTab === 'friends'"
        class="friends-sub-btn"
        :class="{ active: activeSubTab === 'friends' }"
        @click="activeSubTab = 'friends'"
        title="Mine venner"
        aria-label="Mine venner"
      >
        <Users :size="14" />
        <span class="sub-label">Mine venner</span>
        <span class="sub-count-badge">{{ friends.length }}</span>
      </button>

      <button
        type="button"
        role="tab"
        :aria-selected="activeSubTab === 'requests'"
        class="friends-sub-btn"
        :class="{ active: activeSubTab === 'requests' }"
        @click="activeSubTab = 'requests'"
        title="Venneforespørsler"
        aria-label="Venneforespørsler"
      >
        <UserPlus :size="14" />
        <span class="sub-label">Forespørsler</span>
        <span v-if="incomingRequests.length > 0" class="sub-badge-alert">
          {{ incomingRequests.length }}
        </span>
      </button>

      <button
        type="button"
        role="tab"
        :aria-selected="activeSubTab === 'search'"
        class="friends-sub-btn"
        :class="{ active: activeSubTab === 'search' }"
        @click="openSearchTab"
        title="Finn og søk etter venner"
        aria-label="Finn venner"
      >
        <Search :size="14" />
        <span class="sub-label">Finn venner</span>
      </button>

      <button
        type="button"
        role="tab"
        :aria-selected="activeSubTab === 'settings'"
        class="friends-sub-btn"
        :class="{ active: activeSubTab === 'settings' }"
        @click="activeSubTab = 'settings'"
        title="Synlighetsinnstillinger"
        aria-label="Synlighet"
      >
        <Globe :size="14" />
        <span class="sub-label">Synlighet</span>
      </button>
    </div>

    <!-- Innhold / Scroll Area -->
    <div class="friends-scroll-content">
      <!-- DEL 1: MINE VENNER -->
      <FriendsListTab
        v-if="activeSubTab === 'friends'"
        :friends="friends"
        :action-loading-id="actionLoadingId"
        @view-profile="(friend) => emit('view-friend-profile', friend)"
        @remove-friend="handleRemoveFriend"
        @open-search="openSearchTab"
      />

      <!-- DEL 2: FORESPØRSLER -->
      <FriendRequestsTab
        v-else-if="activeSubTab === 'requests'"
        :incoming-requests="incomingRequests"
        :outgoing-requests="outgoingRequests"
        :action-loading-id="actionLoadingId"
        @accept="handleAccept"
        @reject="handleReject"
        @cancel="handleCancel"
      />

      <!-- DEL 3: FINN VENNER -->
      <FriendSearchTab
        v-else-if="activeSubTab === 'search'"
        v-model:search-query="searchQuery"
        :search-results="searchResults"
        :is-searching="isSearching"
        :action-loading-id="actionLoadingId"
        :outgoing-target-ids="outgoingTargetIds"
        :incoming-sender-ids="incomingSenderIds"
        :is-friend="isFriend"
        @clear-search="clearSearch"
        @send-request="handleSendRequest"
        @go-to-requests="activeSubTab = 'requests'"
      />

      <!-- DEL 4: SYNLIGHETSINNSTILLINGER -->
      <FriendVisibilityTab
        v-else-if="activeSubTab === 'settings'"
        :default-visibility="defaultVisibility"
        @set-visibility="handleSetVisibility"
      />
    </div>
  </div>
</template>

<style scoped>
.profile-friends-tab {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.feedback-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  font-size: 0.8rem;
  font-weight: 500;
  flex-shrink: 0;
}

.feedback-banner.success {
  background: rgba(16, 185, 129, 0.16);
  border-bottom: 1px solid rgba(16, 185, 129, 0.3);
  color: #34d399;
}

.feedback-banner.error {
  background: rgba(239, 68, 68, 0.16);
  border-bottom: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
}

.msg-fade-enter-active,
.msg-fade-leave-active {
  transition: all 0.2s ease;
}

.msg-fade-enter-from,
.msg-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* Sub-faner / Segment-kontroll */
.friends-sub-bar {
  display: flex;
  padding: 8px 12px;
  gap: 6px;
  background: rgba(15, 23, 42, 0.5);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  overflow-x: auto;
  scrollbar-width: none;
  flex-shrink: 0;
}

.friends-sub-bar::-webkit-scrollbar {
  display: none;
}

.friends-sub-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 6px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.friends-sub-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #e2e8f0;
}

.friends-sub-btn.active {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.35);
  color: #4ade80;
}

.sub-label {
  font-size: 11.5px;
}

.sub-count-badge {
  background: rgba(255, 255, 255, 0.1);
  padding: 0 5px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
}

.sub-badge-alert {
  background: #f97316;
  color: #fff;
  padding: 0 5px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
  animation: pulse 1.8s infinite ease-in-out;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.85;
    transform: scale(1.08);
  }
}

.friends-scroll-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px calc(24px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (max-width: 480px) {
  .friends-sub-bar {
    padding: 6px 8px;
    gap: 4px;
  }

  .friends-sub-btn {
    padding: 5px 6px;
    font-size: 11px;
  }

  .sub-label {
    font-size: 10.5px;
  }
}
</style>
