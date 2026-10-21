<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  X,
  LogOut,
  Mountain,
  Trophy,
  ShieldCheck,
  RotateCw,
  ClipboardList,
} from 'lucide-vue-next'
import type { GoogleUser, FirebaseCheckinItem } from '@/composables/useAuth'
import type { TurpostItem } from '@/composables/useTurposter'
import type { FriendUser } from '@/composables/useFriends'
import type { SavedTrack } from '@/stores/gpsTrack'
import type { TrackPoint } from '@/composables/useGeolocation'
import type { ProfileTab } from '@/types/profile'
import { useGpsTrackStore } from '@/stores/gpsTrack'
import { useAppStateStore } from '@/stores/appState'
import { useFirebaseTracks } from '@/composables/useFirebaseTracks'
import ProfileTabBar from './profile/ProfileTabBar.vue'
import ProfileCheckinsTab from './profile/ProfileCheckinsTab.vue'
import ProfileTracksTab from './profile/ProfileTracksTab.vue'
import ProfileSpotsTab from './profile/ProfileSpotsTab.vue'
import ProfileFriendsTab from './profile/ProfileFriendsTab.vue'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    activeTab?: ProfileTab
    user: GoogleUser | null
    checkins: FirebaseCheckinItem[]
    isLoading?: boolean
    isAdmin?: boolean
    isAdminModeActive?: boolean
    savedTracksCount?: number
    mySpotsCount?: number
    spotSuggestionsCount?: number
    friendsCount?: number
    pendingFriendRequestsCount?: number
    spots?: TurpostItem[]
    isMySpotsLoading?: boolean
    liveTrackPoints?: TrackPoint[]
    isTracking?: boolean
    highlightedTrackId?: string | null
  }>(),
  {
    activeTab: 'checkins',
    isLoading: false,
    isAdmin: false,
    isAdminModeActive: false,
    savedTracksCount: 0,
    mySpotsCount: 0,
    spotSuggestionsCount: 0,
    friendsCount: 0,
    pendingFriendRequestsCount: 0,
    spots: () => [],
    isMySpotsLoading: false,
    liveTrackPoints: () => [],
    isTracking: false,
    highlightedTrackId: null,
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'logout'): void
  (e: 'refresh'): void
  (e: 'toggle-admin-mode'): void
  (e: 'tab-change', tab: ProfileTab): void
  (e: 'open-saved-tracks'): void
  (e: 'open-my-spots'): void
  (e: 'open-spot-suggestions'): void
  (e: 'open-friends'): void
  (e: 'checkin-deleted', checkinId: string): void
  (e: 'checkin-updated'): void
  (e: 'view-turpost-on-map', checkin: FirebaseCheckinItem): void
  (e: 'view-track', track: SavedTrack | null): void
  (e: 'open-live-track-modal'): void
  (e: 'view-spot', spot: TurpostItem): void
  (e: 'delete-spot', spotId: string): void
  (e: 'add-spot-click'): void
  (e: 'suggest-public', spot: TurpostItem): void
  (e: 'view-checkins', spot: TurpostItem): void
  (e: 'view-friend-profile', friend: FriendUser): void
}>()

const currentTab = ref<ProfileTab>(props.activeTab || 'checkins')

watch(
  () => props.activeTab,
  (newTab) => {
    if (newTab && newTab !== currentTab.value) {
      currentTab.value = newTab
    }
  },
)

function handleTabChange(tab: ProfileTab) {
  currentTab.value = tab
  emit('tab-change', tab)
  if (tab === 'tracks') emit('open-saved-tracks')
  else if (tab === 'spots') emit('open-my-spots')
  else if (tab === 'friends') emit('open-friends')
}

// Unike turposter for telleren i headeren
const sortedCheckins = computed(() => {
  const map = new Map<string, FirebaseCheckinItem>()
  for (const c of props.checkins) {
    const key = c.id || `${c.turpostId}_${c.timestamp}`
    const existing = map.get(key)
    if (!existing || (!existing.isPrivate && c.isPrivate)) {
      map.set(key, c)
    }
  }
  return Array.from(map.values())
})

const uniqueTurpostIds = computed(() => {
  return new Set(sortedCheckins.value.map((c) => String(c.turpostId)))
})

function handleViewOnMap(item: FirebaseCheckinItem) {
  emit('view-turpost-on-map', item)
  emit('close')
}

async function handleViewTrackFromCheckin(item: FirebaseCheckinItem) {
  if (!item.trackId) return
  const trackStore = useGpsTrackStore()
  const appState = useAppStateStore()
  const local = trackStore.savedTracks.find((t) => t.id === item.trackId)
  if (local) {
    trackStore.viewTrackOnMap(local, true)
    appState.requestViewTrack(local)
  } else {
    const { fetchUserTrackById } = useFirebaseTracks()
    const remote = await fetchUserTrackById(item.userId, item.trackId)
    if (remote) {
      trackStore.viewTrackOnMap(remote, true)
      appState.requestViewTrack(remote)
    } else {
      trackStore.viewTrackOnMap(item.trackId, true)
    }
  }
  emit('close')
}

const isRefreshing = ref(false)

const handleForceRefresh = async () => {
  if (isRefreshing.value) return
  isRefreshing.value = true

  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys()
      await Promise.all(
        cacheNames.filter((name) => !name.includes('map-tiles')).map((name) => caches.delete(name)),
      )
    }

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      for (const reg of registrations) {
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
        await reg.update().catch(() => {})
      }
    }
  } catch (err) {
    console.warn('Kunne ikke oppdatere cache fullstendig:', err)
  } finally {
    const appBase = import.meta.env.BASE_URL || '/tortur/'
    window.location.href = appBase
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
      if (props.activeTab) {
        currentTab.value = props.activeTab
      }
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
      name="profile-modal-fade"
      appear
      @after-leave="handleAfterLeave"
    >
      <div
        v-if="isOpen && !isClosing"
        class="profile-modal-backdrop"
        @click.self="requestClose"
      >
        <div
          class="profile-modal-card glass-panel"
          role="dialog"
          aria-modal="true"
        >
          <!-- Header med brukerinfo og Lukk-knapp -->
          <div class="profile-modal-header">
            <!-- Øverste rad: Profilbilde, navn, e-post og Lukk-knapp -->
            <div class="profile-header-top">
              <div class="user-info-row">
                <div class="user-avatar-wrap">
                  <img
                    v-if="user?.avatarUrl"
                    :src="user.avatarUrl"
                    :alt="user.userName"
                    class="user-avatar-img"
                    referrerpolicy="no-referrer"
                  />
                  <div v-else class="user-avatar-fallback">
                    <Mountain :size="24" />
                  </div>
                  <div class="user-online-badge" title="Tilkoblet" />
                </div>
                <div class="user-details">
                  <h3 class="user-name">{{ user?.userName || 'Turgåer' }}</h3>
                  <span class="user-email">{{ user?.email }}</span>
                </div>
              </div>

              <!-- Kompakte tellere for innsjekkinger og unike turposter -->
              <div class="header-stats-badges">
                <div
                  class="header-stat-badge trophy"
                  :title="`${sortedCheckins.length} ${sortedCheckins.length === 1 ? 'innsjekking' : 'innsjekkinger'}`"
                >
                  <Trophy :size="15" />
                  <span class="header-stat-value">{{ sortedCheckins.length }}</span>
                </div>

                <div
                  class="header-stat-badge mountain"
                  :title="`${uniqueTurpostIds.size} ${uniqueTurpostIds.size === 1 ? 'unik turpost' : 'unike turposter'}`"
                >
                  <Mountain :size="15" />
                  <span class="header-stat-value">{{ uniqueTurpostIds.size }}</span>
                </div>
              </div>

              <!-- Lukk-knapp oppe til høyre -->
              <button
                type="button"
                class="btn-profile-close"
                @click="requestClose"
                title="Lukk (Esc)"
                aria-label="Lukk"
              >
                <X :size="18" />
              </button>
            </div>

            <!-- Handlingsknapper under profilinfoen -->
            <div class="profile-header-actions">
              <!-- Oppdater appen / Tving refresh -->
              <button
                type="button"
                class="btn-profile-refresh"
                :disabled="isRefreshing"
                @click="handleForceRefresh"
                title="Søk etter ny versjon og last inn på nytt"
                aria-label="Søk etter ny versjon og last inn på nytt"
              >
                <RotateCw :size="14" :class="{ 'spin-refresh': isRefreshing }" />
                <span class="btn-text">{{ isRefreshing ? 'Laster...' : 'Oppdater' }}</span>
              </button>

              <!-- Admin forslag-knapp (kun synlig når admin har forslag) -->
              <button
                v-if="props.isAdmin && (props.spotSuggestionsCount || 0) > 0"
                type="button"
                class="btn-admin-suggestions profile-suggestions-card"
                @click="emit('open-spot-suggestions')"
                title="Se innkommende forslag til turposter"
                aria-label="Forslag til turposter"
              >
                <ClipboardList :size="14" />
                <span class="btn-text">
                  Forslag ({{ props.spotSuggestionsCount }}
                  {{ props.spotSuggestionsCount === 1 ? 'nytt' : 'nye' }})
                </span>
                <span class="suggestions-badge">{{ props.spotSuggestionsCount }}</span>
              </button>

              <!-- Admin-modus toggle (kun synlig for admin-brukere) -->
              <button
                v-if="props.isAdmin"
                type="button"
                class="btn-admin-toggle"
                :class="{ active: props.isAdminModeActive }"
                @click="emit('toggle-admin-mode')"
                :title="props.isAdminModeActive ? 'Deaktiver admin-modus' : 'Aktiver admin-modus'"
                :aria-label="props.isAdminModeActive ? 'Deaktiver admin-modus' : 'Aktiver admin-modus'"
              >
                <ShieldCheck :size="15" />
                <span class="btn-text">{{ props.isAdminModeActive ? 'Admin: PÅ' : 'Admin: AV' }}</span>
              </button>

              <!-- Logg ut -->
              <button
                type="button"
                class="btn-profile-logout"
                @click="emit('logout')"
                title="Logg ut av TorTur"
                aria-label="Logg ut av TorTur"
              >
                <LogOut :size="14" />
                <span class="btn-text">Logg ut</span>
              </button>
            </div>
          </div>

          <!-- LINJE 2: De fire fanene -->
          <ProfileTabBar
            v-model="currentTab"
            :checkins-count="sortedCheckins.length"
            :saved-tracks-count="props.savedTracksCount"
            :my-spots-count="props.mySpotsCount"
            :friends-count="props.friendsCount"
            :pending-friend-requests-count="props.pendingFriendRequestsCount"
            @update:model-value="handleTabChange"
          />

          <!-- FANE-INNHOLD -->
          <div class="profile-tabs-content">
            <KeepAlive>
              <ProfileCheckinsTab
                v-if="currentTab === 'checkins'"
                :checkins="props.checkins"
                :is-loading="props.isLoading"
                :current-user-id="user?.userId"
                @view-turpost-on-map="handleViewOnMap"
                @view-track="handleViewTrackFromCheckin"
                @checkin-updated="emit('checkin-updated')"
                @checkin-deleted="emit('checkin-deleted', $event)"
              />
              <ProfileTracksTab
                v-else-if="currentTab === 'tracks'"
                :live-track-points="props.liveTrackPoints"
                :is-tracking="props.isTracking"
                :is-logged-in="!!user"
                :highlighted-track-id="props.highlightedTrackId"
                @view-track="emit('view-track', $event)"
                @open-live-track-modal="emit('open-live-track-modal')"
              />
              <ProfileSpotsTab
                v-else-if="currentTab === 'spots'"
                :spots="props.spots"
                :is-loading="props.isMySpotsLoading"
                @view-spot="emit('view-spot', $event)"
                @delete-spot="emit('delete-spot', $event)"
                @add-spot-click="emit('add-spot-click')"
                @suggest-public="emit('suggest-public', $event)"
                @view-checkins="emit('view-checkins', $event)"
              />
              <ProfileFriendsTab
                v-else-if="currentTab === 'friends'"
                :current-user="user"
                @view-friend-profile="emit('view-friend-profile', $event)"
              />
            </KeepAlive>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.profile-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: stretch;
  justify-content: flex-start;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
}

.profile-modal-card {
  width: 640px;
  max-width: 100vw;
  height: 100%;
  height: 100dvh;
  max-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: rgba(15, 23, 42, 0.98);
  border-right: 1px solid rgba(255, 255, 255, 0.12);
  border-top: none;
  border-bottom: none;
  border-left: none;
  border-radius: 0 20px 20px 0;
  box-shadow: 16px 0 48px rgba(0, 0, 0, 0.7);
  overflow: hidden;
  color: #f8fafc;
}

@media (max-width: 640px) {
  .profile-modal-card {
    width: 100vw;
    max-width: 100vw;
    border-radius: 0;
    border-right: none;
  }
}

/* Header */
.profile-modal-header {
  padding: calc(16px + env(safe-area-inset-top, 0px)) 20px 12px
    calc(20px + env(safe-area-inset-left, 0px));
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(15, 23, 42, 0.7);
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

.profile-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.user-info-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.user-avatar-wrap {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  flex-shrink: 0;
}

.user-avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(56, 189, 248, 0.5);
}

.user-avatar-fallback {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: linear-gradient(135deg, #1e293b, #334155);
  border: 2px solid rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
}

.user-online-badge {
  position: absolute;
  bottom: 1px;
  right: 1px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #22c55e;
  border: 2px solid #0f172a;
}

.user-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-name {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-email {
  font-size: 11.5px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Tellere */
.header-stats-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.header-stat-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: default;
  transition: all 0.15s ease;
  user-select: none;
}

.header-stat-badge:hover {
  transform: translateY(-1px);
}

.header-stat-badge.trophy {
  background: rgba(245, 158, 11, 0.16);
  border: 1px solid rgba(245, 158, 11, 0.35);
  color: #fbbf24;
}

.header-stat-badge.mountain {
  background: rgba(16, 185, 129, 0.16);
  border: 1px solid rgba(16, 185, 129, 0.35);
  color: #34d399;
}

.header-stat-value {
  color: #f8fafc;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.btn-profile-close {
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 10px;
  color: #9ca3af;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-profile-close:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
}

/* Handlinger */
.profile-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-profile-refresh,
.btn-admin-toggle,
.btn-profile-logout,
.btn-admin-suggestions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: #cbd5e1;
}

.btn-profile-refresh:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.35);
  color: #38bdf8;
}

.btn-admin-suggestions {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.4);
  color: #fbbf24;
}

.btn-admin-suggestions:hover {
  background: rgba(245, 158, 11, 0.25);
  border-color: #f59e0b;
  color: #ffffff;
}

.suggestions-badge {
  background: #f59e0b;
  color: #0f172a;
  padding: 1px 5px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 800;
}

.btn-admin-toggle {
  background: rgba(255, 255, 255, 0.05);
  color: #94a3b8;
}

.btn-admin-toggle.active {
  background: rgba(234, 88, 12, 0.2);
  border-color: rgba(234, 88, 12, 0.4);
  color: #fb923c;
}

.btn-profile-logout:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.35);
  color: #f87171;
}

.spin-refresh {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Fane-innhold beholder */
.profile-tabs-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Drawer animasjoner */
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

.profile-modal-fade-enter-active,
.profile-modal-fade-appear-active {
  transition: opacity 0.32s ease;
}

.profile-modal-fade-leave-active {
  transition: opacity 0.25s ease;
}

.profile-modal-fade-enter-from,
.profile-modal-fade-appear-from,
.profile-modal-fade-leave-to {
  opacity: 0;
}

.profile-modal-fade-enter-active .profile-modal-card,
.profile-modal-fade-appear-active .profile-modal-card {
  animation: slideDrawerIn 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.profile-modal-fade-leave-active .profile-modal-card {
  animation: slideDrawerOut 0.25s cubic-bezier(0.7, 0, 0.84, 0) forwards;
}

@media (max-width: 480px) {
  .profile-modal-header {
    padding: 10px 14px 8px;
    gap: 7px;
  }

  .profile-header-actions .btn-text {
    display: none;
  }

  .btn-profile-refresh,
  .btn-admin-toggle,
  .btn-profile-logout,
  .btn-admin-suggestions {
    padding: 5px 8px;
    justify-content: center;
  }
}
</style>
