<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  Users,
  UserPlus,
  UserCheck,
  UserX,
  Search,
  X,
  Loader2,
  Globe,
  Lock,
  Clock,
  Check,
  AlertCircle,
  ShieldAlert,
  Send,
  UserMinus
} from 'lucide-vue-next'
import {
  useFriends,
  type FriendUser,
  type FriendRequest,
  type PublicUser,
  type CheckinVisibility
} from '@/composables/useFriends'
import type { GoogleUser } from '@/composables/useAuth'

const props = defineProps<{
  isOpen: boolean
  currentUser: GoogleUser | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
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
  setDefaultVisibility
} = useFriends()

type TabKey = 'friends' | 'requests' | 'search' | 'settings'
const activeTab = ref<TabKey>('friends')

const searchQuery = ref('')
const searchResults = ref<PublicUser[]>([])
const isSearching = ref(false)
const actionLoadingId = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const errorMessage = ref<string | null>(null)

// Dragging state
const modalRef = ref<HTMLElement | null>(null)
const dragPosition = ref({ x: 0, y: 0 })
const isDragging = ref(false)
let dragStart = { x: 0, y: 0 }
let initialPosition = { x: 0, y: 0 }

const modalStyle = computed(() => {
  if (dragPosition.value.x === 0 && dragPosition.value.y === 0) {
    return {}
  }
  return {
    transform: `translate3d(${dragPosition.value.x}px, ${dragPosition.value.y}px, 0)`
  }
})

const startDrag = (e: PointerEvent) => {
  if (e.button !== 0) return
  const target = e.target as HTMLElement | null
  if (target?.closest('button') || target?.closest('input') || target?.closest('a')) {
    return
  }

  isDragging.value = true
  dragStart = { x: e.clientX, y: e.clientY }
  initialPosition = { ...dragPosition.value }

  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

const onDragMove = (e: PointerEvent) => {
  if (!isDragging.value) return

  const deltaX = e.clientX - dragStart.x
  const deltaY = e.clientY - dragStart.y

  let newX = initialPosition.x + deltaX
  let newY = initialPosition.y + deltaY

  if (modalRef.value) {
    const rect = modalRef.value.getBoundingClientRect()
    const currentLeft = rect.left - initialPosition.x
    const currentTop = rect.top - initialPosition.y

    const minX = -currentLeft + 10
    const maxX = window.innerWidth - (currentLeft + 80)
    const minY = -currentTop + 10
    const maxY = window.innerHeight - (currentTop + 40)

    newX = Math.max(minX, Math.min(maxX, newX))
    newY = Math.max(minY, Math.min(maxY, newY))
  }

  dragPosition.value = { x: newX, y: newY }
}

const onDragEnd = () => {
  isDragging.value = false
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
}

// Reset data upon opening
watch(
  () => props.isOpen,
  async (open) => {
    if (open) {
      dragPosition.value = { x: 0, y: 0 }
      errorMessage.value = null
      successMessage.value = null
      if (props.currentUser?.userId) {
        await Promise.all([
          loadFriends(props.currentUser.userId),
          loadFriendRequests(props.currentUser.userId),
          loadDefaultVisibility(props.currentUser.userId)
        ])
        if (incomingRequests.value.length > 0 && friends.value.length === 0) {
          activeTab.value = 'requests'
        }
      }
      if (activeTab.value === 'search') {
        handleSearch()
      }
    }
  }
)

const outgoingTargetIds = computed(() => new Set(outgoingRequests.value.map(r => r.toUserId)))
const incomingSenderIds = computed(() => new Set(incomingRequests.value.map(r => r.fromUserId)))

let searchDebounceTimeout: any = null
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
    searchResults.value = users.filter(u => u.userId !== props.currentUser?.userId)
  } catch (err: any) {
    errorMessage.value = err?.message || 'Kunne ikke søke etter brukere'
  } finally {
    isSearching.value = false
  }
}

async function handleSendRequest(targetUser: PublicUser) {
  if (!props.currentUser) return
  actionLoadingId.value = targetUser.userId
  errorMessage.value = null
  try {
    await sendFriendRequest(props.currentUser, targetUser)
    successMessage.value = `Forespørsel sendt til ${targetUser.userName}!`
    setTimeout(() => { successMessage.value = null }, 3500)
  } catch (err: any) {
    errorMessage.value = err?.message || 'Kunne ikke sende venneforespørsel'
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
    setTimeout(() => { successMessage.value = null }, 3500)
  } catch (err: any) {
    errorMessage.value = err?.message || 'Kunne ikke godta forespørsel'
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
  } catch (err: any) {
    errorMessage.value = err?.message || 'Kunne ikke avvise forespørsel'
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
  } catch (err: any) {
    errorMessage.value = err?.message || 'Kunne ikke avbryte forespørsel'
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
    setTimeout(() => { successMessage.value = null }, 3500)
  } catch (err: any) {
    errorMessage.value = err?.message || 'Kunne ikke fjerne venn'
  } finally {
    actionLoadingId.value = null
  }
}

async function handleSetVisibility(val: CheckinVisibility) {
  if (!props.currentUser) return
  try {
    await setDefaultVisibility(props.currentUser.userId, val)
    successMessage.value = 'Standard synlighet er oppdatert!'
    setTimeout(() => { successMessage.value = null }, 2500)
  } catch (err: any) {
    errorMessage.value = err?.message || 'Kunne ikke lagre innstilling'
  }
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.isOpen) {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
})
</script>

<template>
  <Teleport to="body">
    <transition name="friends-modal-fade">
      <div v-if="isOpen" class="friends-modal-backdrop" @click.self="emit('close')">
        <div
          ref="modalRef"
          class="friends-modal-card glass-panel"
          :class="{ 'is-dragging': isDragging }"
          :style="modalStyle"
          role="dialog"
          aria-modal="true"
        >
          <!-- Header -->
          <div class="friends-modal-header" @pointerdown="startDrag" title="Klikk og dra for å flytte">
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
              @click="emit('close')"
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
              @click="activeTab = 'search'; handleSearch()"
            >
              <Search :size="15" />
              <span>Finn venner</span>
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
            <div v-if="activeTab === 'friends'" class="tab-pane">
              <div v-if="friends.length === 0" class="empty-state">
                <div class="empty-icon-wrap">
                  <Users :size="32" />
                </div>
                <h4>Ingen venner enda</h4>
                <p>Når du blir venner med andre turgåere, kan dere dele innsjekkinger med hverandre.</p>
                <button class="btn-primary-action" @click="activeTab = 'search'; handleSearch()">
                  <UserPlus :size="16" />
                  <span>Finn venner å invitere</span>
                </button>
              </div>

              <div v-else class="friends-list">
                <div
                  v-for="friend in friends"
                  :key="friend.userId"
                  class="friend-card"
                >
                  <div class="friend-user-info">
                    <div class="avatar-wrap">
                      <img
                        v-if="friend.avatarUrl"
                        :src="friend.avatarUrl"
                        :alt="friend.userName"
                        class="avatar-img"
                        referrerpolicy="no-referrer"
                      />
                      <div v-else class="avatar-fallback">
                        <Users :size="18" />
                      </div>
                    </div>
                    <div class="friend-names">
                      <span class="friend-name">{{ friend.userName }}</span>
                      <span v-if="friend.email" class="friend-email">{{ friend.email }}</span>
                    </div>
                  </div>

                  <button
                    class="btn-remove-friend"
                    :disabled="actionLoadingId === friend.userId"
                    @click="handleRemoveFriend(friend)"
                    title="Avslutt vennskap"
                  >
                    <Loader2 v-if="actionLoadingId === friend.userId" :size="14" class="spin" />
                    <UserMinus v-else :size="14" />
                    <span>Fjern</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- FANE 2: FORESPØRSLER -->
            <div v-if="activeTab === 'requests'" class="tab-pane">
              <!-- Mottatte forespørsler -->
              <div class="requests-section">
                <div class="requests-section-title">
                  <UserCheck :size="16" />
                  <span>Mottatte forespørsler ({{ incomingRequests.length }})</span>
                </div>

                <div v-if="incomingRequests.length === 0" class="empty-sub-state">
                  <span>Ingen nye venneforespørsler</span>
                </div>

                <div v-else class="requests-list">
                  <div
                    v-for="req in incomingRequests"
                    :key="req.fromUserId"
                    class="request-card incoming"
                  >
                    <div class="req-user-info">
                      <div class="avatar-wrap">
                        <img
                          v-if="req.userAvatar"
                          :src="req.userAvatar"
                          :alt="req.userName"
                          class="avatar-img"
                          referrerpolicy="no-referrer"
                        />
                        <div v-else class="avatar-fallback">
                          <Users :size="18" />
                        </div>
                      </div>
                      <div class="req-names">
                        <span class="req-name">{{ req.userName }}</span>
                        <span class="req-sub">Vil bli vennen din</span>
                      </div>
                    </div>

                    <div class="req-action-buttons">
                      <button
                        class="btn-accept"
                        :disabled="actionLoadingId === req.fromUserId"
                        @click="handleAccept(req)"
                      >
                        <Loader2 v-if="actionLoadingId === req.fromUserId" :size="14" class="spin" />
                        <Check v-else :size="14" />
                        <span>Godta</span>
                      </button>
                      <button
                        class="btn-reject"
                        :disabled="actionLoadingId === req.fromUserId"
                        @click="handleReject(req.fromUserId)"
                      >
                        <X :size="14" />
                        <span>Avvis</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Sendte forespørsler -->
              <div class="requests-section mt-4">
                <div class="requests-section-title">
                  <Send :size="15" />
                  <span>Sendte forespørsler ({{ outgoingRequests.length }})</span>
                </div>

                <div v-if="outgoingRequests.length === 0" class="empty-sub-state">
                  <span>Ingen ventende sendte forespørsler</span>
                </div>

                <div v-else class="requests-list">
                  <div
                    v-for="req in outgoingRequests"
                    :key="req.toUserId"
                    class="request-card outgoing"
                  >
                    <div class="req-user-info">
                      <div class="avatar-wrap">
                        <img
                          v-if="req.userAvatar"
                          :src="req.userAvatar"
                          :alt="req.userName"
                          class="avatar-img"
                          referrerpolicy="no-referrer"
                        />
                        <div v-else class="avatar-fallback">
                          <Users :size="18" />
                        </div>
                      </div>
                      <div class="req-names">
                        <span class="req-name">{{ req.userName }}</span>
                        <span class="req-sub">Venter på godkjenning...</span>
                      </div>
                    </div>

                    <button
                      class="btn-cancel-req"
                      :disabled="actionLoadingId === req.toUserId"
                      @click="handleCancel(req.toUserId)"
                    >
                      <Loader2 v-if="actionLoadingId === req.toUserId" :size="14" class="spin" />
                      <X v-else :size="14" />
                      <span>Avbryt</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- FANE 3: FINN VENNER -->
            <div v-if="activeTab === 'search'" class="tab-pane">
              <!-- Søkefelt -->
              <div class="search-input-wrap">
                <Search :size="16" class="search-icon" />
                <input
                  v-model="searchQuery"
                  type="text"
                  class="search-input"
                  placeholder="Søk etter turgåere på navn eller e-post..."
                />
                <button
                  v-if="searchQuery"
                  class="search-clear-btn"
                  @click="searchQuery = ''; handleSearch()"
                >
                  <X :size="14" />
                </button>
              </div>

              <!-- Søkeresultater -->
              <div v-if="isSearching" class="loading-state">
                <Loader2 :size="22" class="spin" />
                <span>Søker etter brukere...</span>
              </div>

              <div v-else-if="searchResults.length === 0" class="empty-state">
                <div class="empty-icon-wrap">
                  <Search :size="28" />
                </div>
                <h4>Ingen brukere funnet</h4>
                <p>Prøv et annet søkeord. Brukere må ha logget inn i TorTur minst én gang for å vises her.</p>
              </div>

              <div v-else class="search-results-list">
                <div
                  v-for="user in searchResults"
                  :key="user.userId"
                  class="search-user-card"
                >
                  <div class="search-user-info">
                    <div class="avatar-wrap">
                      <img
                        v-if="user.avatarUrl"
                        :src="user.avatarUrl"
                        :alt="user.userName"
                        class="avatar-img"
                        referrerpolicy="no-referrer"
                      />
                      <div v-else class="avatar-fallback">
                        <Users :size="18" />
                      </div>
                    </div>
                    <div class="search-user-names">
                      <span class="user-display-name">{{ user.userName }}</span>
                      <span v-if="user.email" class="user-email-text">{{ user.email }}</span>
                    </div>
                  </div>

                  <!-- Status / Handling for hver bruker -->
                  <div class="user-status-action">
                    <!-- Allerede venner -->
                    <span v-if="isFriend(user.userId)" class="badge-status friend">
                      <Check :size="13" />
                      <span>Venner</span>
                    </span>

                    <!-- Forespørsel allerede sendt -->
                    <span v-else-if="outgoingTargetIds.has(user.userId)" class="badge-status pending">
                      <Clock :size="13" />
                      <span>Sendt</span>
                    </span>

                    <!-- Har sendt deg en forespørsel -->
                    <button
                      v-else-if="incomingSenderIds.has(user.userId)"
                      class="btn-quick-accept"
                      @click="activeTab = 'requests'"
                    >
                      <UserCheck :size="13" />
                      <span>Svar</span>
                    </button>

                    <!-- Kan invitere -->
                    <button
                      v-else
                      class="btn-invite-user"
                      :disabled="actionLoadingId === user.userId"
                      @click="handleSendRequest(user)"
                    >
                      <Loader2 v-if="actionLoadingId === user.userId" :size="13" class="spin" />
                      <UserPlus v-else :size="13" />
                      <span>Legg til</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- FANE 4: SYNLIGHETSINNSTILLINGER -->
            <div v-if="activeTab === 'settings'" class="tab-pane">
              <div class="settings-card">
                <h4>Standard synlighet for nye innsjekkinger</h4>
                <p class="settings-desc">
                  Velg hvem som som standard skal kunne se dine nye innsjekkinger og turbilder.
                  Du kan også justere dette for hver enkelt innsjekking når du sjekker inn.
                </p>

                <div class="visibility-options-grid">
                  <!-- Valg 1: Alle -->
                  <button
                    class="visibility-option-btn"
                    :class="{ active: defaultVisibility === 'all' }"
                    @click="handleSetVisibility('all')"
                  >
                    <div class="opt-icon-circle all">
                      <Globe :size="20" />
                    </div>
                    <div class="opt-content">
                      <div class="opt-title-row">
                        <span class="opt-title">Alle</span>
                        <Check v-if="defaultVisibility === 'all'" :size="16" class="check-active" />
                      </div>
                      <span class="opt-desc">Innsjekkingen vises for alle turgåere i appen.</span>
                    </div>
                  </button>

                  <!-- Valg 2: Mine venner -->
                  <button
                    class="visibility-option-btn"
                    :class="{ active: defaultVisibility === 'friends' }"
                    @click="handleSetVisibility('friends')"
                  >
                    <div class="opt-icon-circle friends">
                      <Users :size="20" />
                    </div>
                    <div class="opt-content">
                      <div class="opt-title-row">
                        <span class="opt-title">Mine venner</span>
                        <Check v-if="defaultVisibility === 'friends'" :size="16" class="check-active" />
                      </div>
                      <span class="opt-desc">Kun synlig for deg og de du er venner med.</span>
                    </div>
                  </button>

                  <!-- Valg 3: Kun meg -->
                  <button
                    class="visibility-option-btn"
                    :class="{ active: defaultVisibility === 'private' }"
                    @click="handleSetVisibility('private')"
                  >
                    <div class="opt-icon-circle private">
                      <Lock :size="20" />
                    </div>
                    <div class="opt-content">
                      <div class="opt-title-row">
                        <span class="opt-title">Kun meg</span>
                        <Check v-if="defaultVisibility === 'private'" :size="16" class="check-active" />
                      </div>
                      <span class="opt-desc">Helt privat. Synlig kun for deg i din egen profil.</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
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
  background: rgba(10, 15, 25, 0.75);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}

.friends-modal-card {
  width: 100%;
  max-width: 520px;
  max-height: 88vh;
  background: rgba(24, 30, 42, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.08);
  overflow: hidden;
  transition: box-shadow 0.2s ease;
  user-select: none;
}

.friends-modal-card.is-dragging {
  box-shadow: 0 28px 60px rgba(0, 0, 0, 0.7);
}

/* Header */
.friends-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  cursor: grab;
}

.friends-modal-header:active {
  cursor: grabbing;
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
  padding: 8px 12px;
  gap: 6px;
  background: rgba(15, 20, 30, 0.4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  overflow-x: auto;
}

.friends-tab-btn {
  flex: 1;
  min-width: fit-content;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 10px;
  font-size: 0.8rem;
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
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.85; transform: scale(1.08); }
}

/* Scroll Content */
.friends-scroll-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  max-height: calc(88vh - 125px);
}

.tab-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Empty states */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 16px;
  color: #9ca3af;
}

.empty-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  color: #6b7280;
}

.empty-state h4 {
  margin: 0 0 6px 0;
  color: #e5e7eb;
  font-size: 0.95rem;
}

.empty-state p {
  margin: 0 0 16px 0;
  font-size: 0.8rem;
  line-height: 1.4;
  max-width: 320px;
}

.btn-primary-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
  transition: transform 0.15s ease;
}

.btn-primary-action:hover {
  transform: translateY(-1px);
}

.empty-sub-state {
  padding: 16px;
  text-align: center;
  font-size: 0.8rem;
  color: #6b7280;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 12px;
}

/* Friends list */
.friends-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.friend-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  transition: background 0.15s ease;
}

.friend-card:hover {
  background: rgba(255, 255, 255, 0.06);
}

.friend-user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.avatar-wrap {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #9ca3af;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.friend-names {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.friend-name {
  font-size: 0.88rem;
  font-weight: 600;
  color: #f3f4f6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.friend-email {
  font-size: 0.72rem;
  color: #9ca3af;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-remove-friend {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #f87171;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-remove-friend:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.2);
  color: #fff;
}

/* Requests */
.requests-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}

.requests-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.request-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
}

.request-card.incoming {
  border-color: rgba(16, 185, 129, 0.2);
  background: rgba(16, 185, 129, 0.03);
}

.req-user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.req-names {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.req-name {
  font-size: 0.86rem;
  font-weight: 600;
  color: #f3f4f6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.req-sub {
  font-size: 0.72rem;
  color: #9ca3af;
}

.req-action-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-accept {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: #10b981;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-accept:hover:not(:disabled) {
  background: #059669;
}

.btn-reject,
.btn-cancel-req {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.08);
  color: #9ca3af;
  border: none;
  border-radius: 8px;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-reject:hover:not(:disabled),
.btn-cancel-req:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

/* Search */
.search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: #6b7280;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 10px 36px 10px 36px;
  background: rgba(15, 20, 30, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  color: #f3f4f6;
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.search-input:focus {
  border-color: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
}

.search-clear-btn {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  padding: 4px;
}

.search-results-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-user-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
}

.search-user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.search-user-names {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-display-name {
  font-size: 0.86rem;
  font-weight: 600;
  color: #f3f4f6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-email-text {
  font-size: 0.72rem;
  color: #9ca3af;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.badge-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 600;
}

.badge-status.friend {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.badge-status.pending {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

.btn-invite-user {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.btn-invite-user:hover:not(:disabled) {
  transform: translateY(-1px);
}

.btn-quick-accept {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  background: #10b981;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

/* Synlighetsinnstillinger */
.settings-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0;
}

.settings-card h4 {
  margin: 0;
  font-size: 0.92rem;
  color: #f3f4f6;
  font-weight: 700;
}

.settings-desc {
  margin: 0 0 6px 0;
  font-size: 0.78rem;
  line-height: 1.45;
  color: #9ca3af;
}

.visibility-options-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.visibility-option-btn {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.visibility-option-btn:hover {
  background: rgba(255, 255, 255, 0.06);
}

.visibility-option-btn.active {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.4);
}

.opt-icon-circle {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.opt-icon-circle.all {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.opt-icon-circle.friends {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.opt-icon-circle.private {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

.opt-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.opt-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.opt-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: #f3f4f6;
}

.check-active {
  color: #34d399;
}

.opt-desc {
  font-size: 0.74rem;
  color: #9ca3af;
  line-height: 1.35;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.mt-4 {
  margin-top: 16px;
}

/* Transisjoner */
.friends-modal-fade-enter-active,
.friends-modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.friends-modal-fade-enter-from,
.friends-modal-fade-leave-to {
  opacity: 0;
}

.msg-fade-enter-active,
.msg-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.msg-fade-enter-from,
.msg-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
