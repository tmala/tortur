<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  Users,
  UserPlus,
  Search,
  X,
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
  isOpen: boolean
  currentUser: GoogleUser | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
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
const activeTab = ref<TabKey>('friends')

const searchQuery = ref('')
const searchResults = ref<PublicUser[]>([])
const isSearching = ref(false)
const actionLoadingId = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const errorMessage = ref<string | null>(null)

// Reset data upon opening
watch(
  () => props.isOpen,
  async (open) => {
    if (open) {
      errorMessage.value = null
      successMessage.value = null
      if (props.currentUser?.userId) {
        await Promise.all([
          loadFriends(props.currentUser.userId),
          loadFriendRequests(props.currentUser.userId),
          loadDefaultVisibility(props.currentUser.userId),
        ])
        if (incomingRequests.value.length > 0 && friends.value.length === 0) {
          activeTab.value = 'requests'
        }
      }
      if (activeTab.value === 'search') {
        handleSearch()
      }
    }
  },
)

const outgoingTargetIds = computed(() => new Set(outgoingRequests.value.map((r) => r.toUserId)))
const incomingSenderIds = computed(() => new Set(incomingRequests.value.map((r) => r.fromUserId)))

let searchDebounceTimeout: ReturnType<typeof setTimeout> | undefined = undefined
watch(searchQuery, () => {
  clearTimeout(searchDebounceTimeout)
  searchDebounceTimeout = setTimeout(() => {
    if (props.isOpen && activeTab.value === 'search') {
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
    // Sorter slik at andre brukere vises først, og ikke innlogget bruker
    searchResults.value = users.filter((u) => u.userId !== props.currentUser?.userId)
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'Kunne ikke søke etter brukere'
  } finally {
    isSearching.value = false
  }
}

function openSearchTab() {
  activeTab.value = 'search'
  handleSearch()
}

function clearSearch() {
  searchQuery.value = ''
  handleSearch()
}

async function handleSendRequest(targetUser: PublicUser) {
  if (!props.currentUser) return
  actionLoadingId.value = targetUser.userId
  errorMessage.value = null
  try {
    await sendFriendRequest(props.currentUser, targetUser)
    successMessage.value = `Forespørsel sendt til ${targetUser.userName}!`
    setTimeout(() => {
      successMessage.value = null
    }, 3500)
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'Kunne ikke sende venneforespørsel'
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
    successMessage.value = `Du og ${request.userName} er nå venner!`
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
  if (!confirm(`Er du sikker på at du vil avslutte vennskapet med ${friend.userName}?`)) return

  actionLoadingId.value = friend.userId
  errorMessage.value = null
  try {
    await removeFriend(props.currentUser.userId, friend.userId)
    successMessage.value = `Vennskapet med ${friend.userName} er avsluttet.`
    setTimeout(() => {
      successMessage.value = null
    }, 3500)
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'Kunne ikke fjerne venn'
  } finally {
    actionLoadingId.value = null
  }
}

async function handleSetVisibility(val: CheckinVisibility) {
  if (!props.currentUser) return
  try {
    await setDefaultVisibility(props.currentUser.userId, val)
    successMessage.value = 'Standard synlighet er oppdatert!'
    setTimeout(() => {
      successMessage.value = null
    }, 2500)
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'Kunne ikke lagre innstilling'
  }
}

const isClosing = ref(false)

function requestClose() {
  if (isClosing.value) return
  isClosing.value = true
}

function handleAfterLeave() {
  isClosing.value = false
  emit('close')
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      isClosing.value = false
    }
  },
)

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.isOpen && !isClosing.value) {
    requestClose()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <Teleport to="body">
    <transition
      name="friends-modal-fade"
      appear
      @after-leave="handleAfterLeave"
    >
      <div
        v-if="isOpen && !isClosing"
        class="friends-modal-backdrop"
        @click.self="requestClose"
      >
        <div
          class="friends-modal-card glass-panel"
          role="dialog"
          aria-modal="true"
        >
          <!-- Header -->
          <div class="friends-modal-header">
            <div class="header-title-row">
              <div class="header-icon-badge">
                <Users :size="20" />
              </div>
              <div class="header-text-group">
                <h3>Venner og synlighet</h3>
                <span class="header-sub">Administrer venner og hvem som ser dine turer</span>
              </div>
            </div>

            <button
              class="btn-friends-close"
              @click="requestClose"
              title="Lukk (Esc)"
              aria-label="Lukk"
            >
              <X :size="18" />
            </button>
          </div>

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

          <!-- Faner -->
          <div class="friends-tabs-bar">
            <button
              class="friends-tab-btn"
              :class="{ active: activeTab === 'friends' }"
              @click="activeTab = 'friends'"
            >
              <Users :size="15" />
              <span>Mine venner</span>
              <span class="tab-count-badge">{{ friends.length }}</span>
            </button>

            <button
              class="friends-tab-btn"
              :class="{ active: activeTab === 'requests' }"
              @click="activeTab = 'requests'"
            >
              <UserPlus :size="15" />
              <span>Forespørsler</span>
              <span v-if="incomingRequests.length > 0" class="tab-badge-alert">
                {{ incomingRequests.length }}
              </span>
            </button>

            <button
              class="friends-tab-btn"
              :class="{ active: activeTab === 'search' }"
              @click="openSearchTab"
              title="Finn / søk etter venner"
            >
              <Search :size="15" />
              <span>Venner</span>
            </button>

            <button
              class="friends-tab-btn"
              :class="{ active: activeTab === 'settings' }"
              @click="activeTab = 'settings'"
            >
              <Globe :size="15" />
              <span>Synlighet</span>
            </button>
          </div>

          <!-- Innhold / Scroll Area -->
          <div class="friends-scroll-content">
            <!-- FANE 1: MINE VENNER -->
            <FriendsListTab
              v-if="activeTab === 'friends'"
              :friends="friends"
              :action-loading-id="actionLoadingId"
              @view-profile="(friend) => emit('view-friend-profile', friend)"
              @remove-friend="handleRemoveFriend"
              @open-search="openSearchTab"
            />

            <!-- FANE 2: FORESPØRSLER -->
            <FriendRequestsTab
              v-else-if="activeTab === 'requests'"
              :incoming-requests="incomingRequests"
              :outgoing-requests="outgoingRequests"
              :action-loading-id="actionLoadingId"
              @accept="handleAccept"
              @reject="handleReject"
              @cancel="handleCancel"
            />

            <!-- FANE 3: FINN VENNER -->
            <FriendSearchTab
              v-else-if="activeTab === 'search'"
              v-model:search-query="searchQuery"
              :search-results="searchResults"
              :is-searching="isSearching"
              :action-loading-id="actionLoadingId"
              :outgoing-target-ids="outgoingTargetIds"
              :incoming-sender-ids="incomingSenderIds"
              :is-friend="isFriend"
              @clear-search="clearSearch"
              @send-request="handleSendRequest"
              @go-to-requests="activeTab = 'requests'"
            />

            <!-- FANE 4: SYNLIGHETSINNSTILLINGER -->
            <FriendVisibilityTab
              v-else-if="activeTab === 'settings'"
              :default-visibility="defaultVisibility"
              @set-visibility="handleSetVisibility"
            />
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.friends-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: stretch;
  justify-content: flex-start;
  z-index: 10500;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
}

.friends-modal-card {
  width: 540px;
  max-width: calc(100vw - 32px);
  height: 100%;
  height: 100dvh;
  max-height: 100dvh;
  background: rgba(15, 23, 42, 0.98);
  border-right: 1px solid rgba(255, 255, 255, 0.12);
  border-top: none;
  border-bottom: none;
  border-left: none;
  border-radius: 0 20px 20px 0;
  display: flex;
  flex-direction: column;
  box-shadow: 16px 0 48px rgba(0, 0, 0, 0.7);
  overflow: hidden;
}

@media (max-width: 640px) {
  .friends-modal-card {
    width: 100vw;
    max-width: 100vw;
    border-radius: 0;
    border-right: none;
  }
}

/* Header */
.friends-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(16px + env(safe-area-inset-top, 0px)) 20px 14px calc(20px + env(safe-area-inset-left, 0px));
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(15, 23, 42, 0.7);
}

.header-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon-badge {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
}

.header-text-group h3 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: #f3f4f6;
  letter-spacing: -0.01em;
}

.header-sub {
  font-size: 0.75rem;
  color: #9ca3af;
}

.btn-friends-close {
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 10px;
  color: #9ca3af;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-friends-close:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

/* Feedback banners */
.feedback-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 0.82rem;
  font-weight: 500;
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

/* Faner */
.friends-tabs-bar {
  display: flex;
  padding: 8px 10px;
  gap: 6px;
  background: rgba(15, 20, 30, 0.4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.friends-tabs-bar::-webkit-scrollbar {
  display: none;
}

.friends-tab-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-radius: 10px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #9ca3af;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.friends-tab-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #e5e7eb;
}

.friends-tab-btn.active {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  box-shadow: inset 0 0 0 1px rgba(16, 185, 129, 0.3);
}

.tab-count-badge {
  background: rgba(255, 255, 255, 0.1);
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 0.7rem;
}

.tab-badge-alert {
  background: #f97316;
  color: #fff;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 0.7rem;
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

/* Scroll Content */
.friends-scroll-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px calc(24px + env(safe-area-inset-bottom, 0px)) calc(20px + env(safe-area-inset-left, 0px));
  scrollbar-gutter: stable;
}

/* Transisjoner */
@keyframes slideDrawerIn {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}

@keyframes slideDrawerOut {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-100%);
  }
}

.friends-modal-fade-enter-active,
.friends-modal-fade-appear-active {
  transition: opacity 0.32s ease;
}

.friends-modal-fade-leave-active {
  transition: opacity 0.25s ease;
}

.friends-modal-fade-enter-from,
.friends-modal-fade-appear-from,
.friends-modal-fade-leave-to {
  opacity: 0;
}

.friends-modal-fade-enter-active .friends-modal-card,
.friends-modal-fade-appear-active .friends-modal-card {
  animation: slideDrawerIn 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.friends-modal-fade-leave-active .friends-modal-card {
  animation: slideDrawerOut 0.25s cubic-bezier(0.7, 0, 0.84, 0) forwards;
}

.msg-fade-enter-active,
.msg-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.msg-fade-enter-from,
.msg-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
