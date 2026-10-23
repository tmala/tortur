<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  X,
  Users,
  Trophy,
  Mountain,
  Calendar,
  ChevronDown,
  Maximize2,
  Map as MapIcon,
  Globe,
  Route,
  MapPin,
  Clock,
  Eye,
} from 'lucide-vue-next'
import type { FirebaseCheckinItem } from '@/composables/useAuth'
import { useFriends, type FriendUser } from '@/composables/useFriends'
import { useGpsTrackStore, type SavedTrack } from '@/stores/gpsTrack'
import { useAppStateStore } from '@/stores/appState'
import { useFirebaseTracks } from '@/composables/useFirebaseTracks'
import { formatDistance } from '@/composables/useGeolocation'
import CheckinSocialSection from './CheckinSocialSection.vue'
import MonthGroupHeader from './MonthGroupHeader.vue'
import { useMonthGroups } from '@/composables/useMonthGroups'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'

const props = defineProps<{
  isOpen: boolean
  friend: FriendUser | null
  currentUserId?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'view-turpost-on-map', checkin: FirebaseCheckinItem): void
  (e: 'view-track-on-map', track: SavedTrack): void
}>()

const { fetchFriendCheckins } = useFriends()

const checkins = ref<FirebaseCheckinItem[]>([])
const isLoading = ref(false)
// Sporer hvilke innsjekkinger som er manuelt ekspandert i listen.
// Som standard er alle innsjekkinger minimert (ikke ekspandert).
const expandedCheckinIds = ref<Set<string>>(new Set())
const lightboxImage = ref<string | null>(null)



async function loadCheckins() {
  if (!props.friend?.userId) {
    checkins.value = []
    return
  }

  isLoading.value = true
  try {
    const data = await fetchFriendCheckins(props.friend.userId)
    checkins.value = data.map((c) => ({
      ...c,
      userId: c.userId || props.friend?.userId || '',
      userName: c.userName || props.friend?.userName || '',
    }))
    expandedCheckinIds.value.clear()
  } catch (err) {
    console.warn('Kunne ikke laste vennens innsjekkinger:', err)
    checkins.value = []
  } finally {
    isLoading.value = false
  }
}

const uniqueTurpostIds = computed(() => {
  return new Set(checkins.value.map((c) => String(c.turpostId)))
})

// Månedsgruppering av vennens innsjekkinger
const {
  monthGroups,
  isMonthExpanded,
  toggleMonth,
  resetToLatest,
} = useMonthGroups(checkins, {
  getDate: (item) => item.timestamp,
})

// Tab-tilstand ('checkins' eller 'tracks')
const activeTab = ref<'checkins' | 'tracks'>('checkins')
const friendTracks = ref<SavedTrack[]>([])
const isLoadingTracks = ref(false)
const expandedTrackIds = ref<Set<string>>(new Set())

async function loadTracks() {
  if (!props.friend?.userId) {
    friendTracks.value = []
    return
  }

  isLoadingTracks.value = true
  try {
    const { fetchFriendTracks } = useFirebaseTracks()
    const data = await fetchFriendTracks(props.friend.userId)
    friendTracks.value = data
    expandedTrackIds.value.clear()
  } catch (err) {
    console.warn('Kunne ikke laste vennens GPS-spor:', err)
    friendTracks.value = []
  } finally {
    isLoadingTracks.value = false
  }
}

const totalTracksDistanceMeters = computed(() => {
  return friendTracks.value.reduce((acc, t) => acc + (t.distanceMeters || 0), 0)
})

const {
  monthGroups: trackMonthGroups,
  isMonthExpanded: isTrackMonthExpanded,
  toggleMonth: toggleTrackMonth,
  resetToLatest: resetTrackToLatest,
} = useMonthGroups(friendTracks, {
  getDate: (item) => item.startTime || item.createdAt,
})

function toggleTrackExpand(id: string) {
  const next = new Set(expandedTrackIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  expandedTrackIds.value = next
}

function isTrackExpanded(id: string): boolean {
  return expandedTrackIds.value.has(id)
}

function handleViewFriendTrack(track: SavedTrack) {
  const trackStore = useGpsTrackStore()
  const appState = useAppStateStore()
  trackStore.viewTrackOnMap(track, true)
  appState.requestViewTrack(track)
  emit('view-track-on-map', track)
}

function computeGroupDistance(tracks: SavedTrack[]): number {
  return tracks.reduce((acc, t) => acc + (t.distanceMeters || 0), 0)
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '< 1 min'
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 60) return `${totalMin} min`
  const hours = Math.floor(totalMin / 60)
  const remMin = totalMin % 60
  return remMin > 0 ? `${hours} t ${remMin} min` : `${hours} t`
}

watch(
  () => [props.isOpen, props.friend?.userId],
  ([newOpen, newFriendId]) => {
    if (newOpen && newFriendId) {
      expandedCheckinIds.value.clear()
      expandedTrackIds.value.clear()
      loadCheckins()
      loadTracks()
      resetToLatest()
      resetTrackToLatest()
    }
  },
  { immediate: true },
)

function toggleExpand(id: string) {
  const next = new Set(expandedCheckinIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  expandedCheckinIds.value = next
}

function isExpanded(id: string): boolean {
  return expandedCheckinIds.value.has(id)
}

function handleViewOnMap(item: FirebaseCheckinItem) {
  emit('view-turpost-on-map', item)
}

async function handleViewTrack(item: FirebaseCheckinItem) {
  if (!item.trackId) return
  const trackStore = useGpsTrackStore()
  const appState = useAppStateStore()
  const local = trackStore.savedTracks.find((t) => t.id === item.trackId)
  if (local) {
    trackStore.viewTrackOnMap(local, true)
    appState.requestViewTrack(local)
    emit('view-track-on-map', local)
  } else {
    const { fetchUserTrackById } = useFirebaseTracks()
    const remote = await fetchUserTrackById(item.userId, item.trackId)
    if (remote) {
      trackStore.viewTrackOnMap(remote, true)
      appState.requestViewTrack(remote)
      emit('view-track-on-map', remote)
    } else {
      trackStore.viewTrackOnMap(item.trackId, true)
      emit('view-track-on-map', { id: item.trackId, name: 'GPS-spor' } as SavedTrack)
    }
  }
}

function handleSocialUpdated(updatedItem: FirebaseCheckinItem) {
  const idx = checkins.value.findIndex((c) => c.id === updatedItem.id)
  if (idx !== -1) {
    checkins.value[idx] = { ...checkins.value[idx], ...updatedItem }
  }
}

function formatDate(isoString?: string): string {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    return d.toLocaleDateString('no-NO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
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
    if (lightboxImage.value) {
      lightboxImage.value = null
    } else {
      requestClose()
    }
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
  <transition
    name="modal-fade"
    appear
    @after-leave="handleAfterLeave"
  >
      <div
        v-if="isOpen && friend && !isClosing"
        class="friend-profile-backdrop"
        @click.self="requestClose"
      >
        <div
          class="friend-profile-card glass-panel"
        >
        <!-- Modal Header -->
        <div class="card-header">
          <div class="user-info-row">
            <div class="avatar-wrap">
              <img
                v-if="friend.avatarUrl"
                :src="friend.avatarUrl"
                :alt="friend.userName"
                class="avatar-img"
                referrerpolicy="no-referrer"
              />
              <div v-else class="avatar-fallback">
                <Users :size="24" />
              </div>
            </div>

            <div class="user-details">
              <div class="name-badge-row">
                <h3 class="user-name">{{ friend.userName }}</h3>
                <span class="friend-pill">
                  <Users :size="10" />
                  <span>Venn</span>
                </span>
              </div>
              <span v-if="friend.email" class="user-email">{{ friend.email }}</span>
              <span v-if="friend.since" class="friend-since">
                Venn siden {{ formatDate(friend.since).split(',')[0] }}
              </span>
            </div>
          </div>

          <button type="button" class="btn-close" title="Lukk" @click="requestClose">
            <X :size="18" />
          </button>
        </div>

        <!-- Statistikk-brikker -->
        <div class="stats-row">
          <template v-if="activeTab === 'checkins'">
            <div class="stat-box">
              <div class="stat-icon-wrap trophy">
                <Trophy :size="20" />
              </div>
              <div class="stat-content">
                <span class="stat-num">{{ isLoading ? '…' : checkins.length }}</span>
                <span class="stat-label">Innsjekkinger</span>
              </div>
            </div>

            <div class="stat-box">
              <div class="stat-icon-wrap mountain">
                <Mountain :size="20" />
              </div>
              <div class="stat-content">
                <span class="stat-num">{{ isLoading ? '…' : uniqueTurpostIds.size }}</span>
                <span class="stat-label">Unike turposter</span>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="stat-box">
              <div class="stat-icon-wrap route-icon-wrap">
                <Route :size="20" />
              </div>
              <div class="stat-content">
                <span class="stat-num">{{ isLoadingTracks ? '…' : friendTracks.length }}</span>
                <span class="stat-label">Delte turer</span>
              </div>
            </div>

            <div class="stat-box">
              <div class="stat-icon-wrap distance-icon-wrap">
                <MapPin :size="20" />
              </div>
              <div class="stat-content">
                <span class="stat-num">{{ isLoadingTracks ? '…' : formatDistance(totalTracksDistanceMeters) }}</span>
                <span class="stat-label">Total distanse</span>
              </div>
            </div>
          </template>
        </div>

        <!-- Tabs for Innsjekkinger og GPS-spor -->
        <div class="profile-tabs-nav">
          <button
            type="button"
            class="profile-tab-btn"
            :class="{ active: activeTab === 'checkins' }"
            @click="activeTab = 'checkins'"
          >
            <Trophy :size="13" />
            <span>Innsjekkinger</span>
            <span class="tab-badge checkins">{{ isLoading ? '…' : checkins.length }}</span>
          </button>

          <button
            type="button"
            class="profile-tab-btn"
            :class="{ active: activeTab === 'tracks' }"
            @click="activeTab = 'tracks'"
          >
            <Route :size="13" />
            <span>GPS-spor</span>
            <span class="tab-badge tracks">{{ isLoadingTracks ? '…' : friendTracks.length }}</span>
          </button>
        </div>

        <!-- Fane 1: Innsjekkinger seksjon -->
        <template v-if="activeTab === 'checkins'">
          <!-- Scroll-område for innsjekkinger -->
          <div class="checkins-scroll-area">
            <LoadingSpinner
              v-if="isLoading"
              :label="`Laster ${friend.userName}s turer...`"
              color="#38bdf8"
            />

            <div v-else-if="checkins.length === 0" class="empty-state">
              <p>{{ friend.userName }} har ingen delte innsjekkinger enda.</p>
            </div>

          <div v-else class="checkins-month-groups">
            <div
              v-for="group in monthGroups"
              :key="group.key"
              class="month-group"
            >
              <MonthGroupHeader
                :label="group.label"
                :count="group.items.length"
                :is-expanded="isMonthExpanded(group.key)"
                accent-color="#38bdf8"
                @toggle="toggleMonth(group.key)"
              />

              <div v-if="isMonthExpanded(group.key)" class="month-items-list checkins-accordion">
                <div
                  v-for="item in group.items"
                  :key="item.id"
                  class="checkin-item"
                  :class="{ expanded: isExpanded(item.id) }"
                >
                  <!-- Overskriftsrad (klikkbar for ekspandering) -->
                  <button type="button" class="checkin-header-btn" @click="toggleExpand(item.id)">
                <div class="checkin-title-left">
                  <span class="turpost-name">{{ item.turpostName || 'Navnløs turpost' }}</span>
                  <span
                    v-if="item.visibility === 'friends'"
                    class="vis-tag friends"
                    title="Delt med venner"
                  >
                    <Users :size="10" /> Venner
                  </span>
                  <span v-else class="vis-tag all" title="Offentlig tur">
                    <Globe :size="10" /> Alle
                  </span>
                </div>

                <div class="checkin-title-right">
                  <button
                    v-if="item.trackId"
                    type="button"
                    class="btn-friend-track-header"
                    title="Vis tilknyttet GPS-spor på kart"
                    aria-label="Vis GPS-spor på kart"
                    @click.stop="handleViewTrack(item)"
                  >
                    <Route :size="11" />
                    <span>GPS-spor</span>
                  </button>
                  <span class="checkin-date">
                    <Calendar :size="11" />
                    {{ formatDate(item.timestamp) }}
                  </span>
                  <ChevronDown
                    :size="16"
                    class="chevron-icon"
                    :class="{ rotated: isExpanded(item.id) }"
                  />
                </div>
              </button>

              <!-- Ekspandert innhold -->
              <div v-if="isExpanded(item.id)" class="checkin-expanded-content">
                <!-- Beskrivelse / Turboknotat -->
                <div v-if="item.description" class="checkin-desc-bubble">
                  <p>{{ item.description }}</p>
                </div>

                <!-- Bilde -->
                <div v-if="item.imageUrl" class="checkin-photo-wrap">
                  <button
                    type="button"
                    class="photo-btn"
                    title="Klikk for fullskjermvisning"
                    @click="lightboxImage = item.imageUrl"
                  >
                    <img
                      :src="item.imageUrl"
                      alt="Turbilde"
                      class="checkin-photo-thumb"
                      loading="lazy"
                    />
                    <div class="photo-overlay">
                      <Maximize2 :size="16" />
                    </div>
                  </button>
                </div>

                <p v-if="!item.description && !item.imageUrl" class="checkin-empty-detail">
                  Ingen turboknotat eller bilde registrert på denne turen.
                </p>

                <!-- Handlingsknapper (Vis på kart og GPS-spor) -->
                <div class="checkin-actions-bar">
                  <button
                    type="button"
                    class="btn-checkin-action"
                    title="Vis og flytt kartet til denne turposten"
                    @click.stop="handleViewOnMap(item)"
                  >
                    <MapIcon :size="12" />
                    <span>Vis på kart</span>
                  </button>
                  <button
                    v-if="item.trackId"
                    type="button"
                    class="btn-checkin-action track-action"
                    title="Vis tilknyttet GPS-spor på kart"
                    @click.stop="handleViewTrack(item)"
                  >
                    <Route :size="12" />
                    <span>GPS-spor</span>
                  </button>
                </div>

                <!-- Reaksjoner og kommentarer -->
                <CheckinSocialSection
                  :checkin="item"
                  :current-user-id="currentUserId"
                  @updated="handleSocialUpdated"
                />
              </div>
            </div>
              </div>
            </div>
          </div>
        </div>
        </template>

        <!-- Fane 2: GPS-spor seksjon -->
        <template v-else>
          <!-- Scroll-område for GPS-spor -->
          <div class="checkins-scroll-area">
            <LoadingSpinner
              v-if="isLoadingTracks"
              :label="`Laster ${friend.userName}s GPS-spor...`"
              color="#ea580c"
            />

            <div v-else-if="friendTracks.length === 0" class="empty-state">
              <p>{{ friend.userName }} har ingen delte GPS-spor enda.</p>
            </div>

            <div v-else class="checkins-month-groups">
              <div
                v-for="group in trackMonthGroups"
                :key="group.key"
                class="month-group"
              >
                <MonthGroupHeader
                  :label="group.label"
                  :count="group.items.length"
                  count-unit-single="tur"
                  count-unit-plural="turer"
                  accent-color="#ea580c"
                  :is-expanded="isTrackMonthExpanded(group.key)"
                  @toggle="toggleTrackMonth(group.key)"
                >
                  <template #right>
                    <span class="month-distance">
                      {{ formatDistance(computeGroupDistance(group.items)) }}
                    </span>
                  </template>
                </MonthGroupHeader>

                <div v-if="isTrackMonthExpanded(group.key)" class="month-items-list tracks-accordion">
                  <div
                    v-for="track in group.items"
                    :key="track.id"
                    class="friend-track-item"
                    :class="{ expanded: isTrackExpanded(track.id) }"
                  >
                    <!-- Overskriftsrad (klikkbar) -->
                    <button type="button" class="track-header-btn" @click="toggleTrackExpand(track.id)">
                      <div class="track-title-left">
                        <span class="track-name" :title="track.name">{{ track.name }}</span>
                        <span
                          class="vis-tag"
                          :class="track.visibility === 'all' ? 'all' : 'friends'"
                          :title="track.visibility === 'all' ? 'Synlig for alle' : 'Delt med venner'"
                        >
                          <Globe v-if="track.visibility === 'all'" :size="10" />
                          <Users v-else :size="10" />
                          <span>{{ track.visibility === 'all' ? 'Alle' : 'Venner' }}</span>
                        </span>
                      </div>

                      <ChevronDown
                        :size="15"
                        class="track-chevron"
                        :class="{ rotated: isTrackExpanded(track.id) }"
                      />
                    </button>

                    <!-- Metadata-rad: Distanse, varighet, dato -->
                    <div class="track-meta-row" @click="toggleTrackExpand(track.id)">
                      <div class="meta-item">
                        <MapPin :size="12" class="meta-icon" />
                        <span>{{ formatDistance(track.distanceMeters) }}</span>
                      </div>
                      <div class="meta-item">
                        <Clock :size="12" class="meta-icon" />
                        <span>{{ formatDuration(track.durationMs) }}</span>
                      </div>
                      <div class="meta-item">
                        <Calendar :size="12" class="meta-icon" />
                        <span>{{ formatDate(new Date(track.startTime || track.createdAt).toISOString()).split(',')[0] }}</span>
                      </div>
                    </div>

                    <!-- Ekspandert del -->
                    <div v-if="isTrackExpanded(track.id)" class="track-expanded-content">
                      <div class="track-actions-row">
                        <button
                          type="button"
                          class="btn-track-action btn-view-map"
                          @click.stop="handleViewFriendTrack(track)"
                          title="Vis på kart og zoom til sporet"
                        >
                          <Eye :size="13" />
                          <span>Vis på kart</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Lightbox for fullskjermbilde -->
        <transition name="lightbox-fade">
          <div v-if="lightboxImage" class="lightbox-backdrop" @click="lightboxImage = null">
            <div class="lightbox-dialog" @click.stop>
              <button
                type="button"
                class="btn-lightbox-close"
                title="Lukk bildevisning"
                @click="lightboxImage = null"
              >
                <X :size="20" />
              </button>
              <img :src="lightboxImage" alt="Fullskjerm turbilde" class="lightbox-img" />
            </div>
          </div>
        </transition>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.friend-profile-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: stretch;
  justify-content: flex-start;
  z-index: 11000;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
}

.friend-profile-card {
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
  .friend-profile-card {
    width: 100vw;
    max-width: 100vw;
    border-radius: 0;
    border-right: none;
  }
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(16px + env(safe-area-inset-top, 0px)) 20px 14px calc(20px + env(safe-area-inset-left, 0px));
  background: rgba(15, 23, 42, 0.7);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.user-info-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar-wrap {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid #0284c7;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.08);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
}

.user-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.name-badge-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-name {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #f8fafc;
}

.friend-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px;
  background: rgba(16, 185, 129, 0.18);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #34d399;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 600;
}

.user-email {
  font-size: 11px;
  color: #94a3b8;
}

.friend-since {
  font-size: 10px;
  color: #64748b;
}

.btn-close {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-close:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

/* Statistikk */
.stats-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.stat-box {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 8px 12px;
}

.stat-icon-wrap {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-icon-wrap.trophy {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

.stat-icon-wrap.mountain {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.stat-icon-wrap.route-icon-wrap {
  background: rgba(249, 115, 22, 0.15);
  color: #fb923c;
}

.stat-icon-wrap.distance-icon-wrap {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
}

/* Tabs nav */
.profile-tabs-nav {
  display: flex;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 6px 12px;
  gap: 8px;
}

.profile-tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.profile-tab-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #f1f5f9;
}

.profile-tab-btn.active {
  background: rgba(255, 255, 255, 0.09);
  border-color: rgba(255, 255, 255, 0.14);
  color: #ffffff;
}

.tab-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
}

.tab-badge.checkins {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
}

.tab-badge.tracks {
  background: rgba(249, 115, 22, 0.2);
  color: #fb923c;
}

.count-badge.badge-orange {
  background: rgba(249, 115, 22, 0.2);
  color: #fb923c;
}

.text-orange {
  color: #fb923c;
}

.month-distance {
  font-size: 11px;
  font-weight: 600;
  color: #cbd5e1;
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 7px;
  border-radius: 6px;
}

/* Friend track items */
.tracks-accordion {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.friend-track-item {
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  overflow: hidden;
  transition: all 0.15s ease;
}

.friend-track-item.expanded {
  border-color: rgba(249, 115, 22, 0.4);
  background: rgba(15, 23, 42, 0.8);
}

.track-header-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  color: #f1f5f9;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  gap: 8px;
}

.track-title-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.friend-track-item .track-name {
  font-size: 13px;
  font-weight: 600;
  color: #f8fafc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.friend-track-item .vis-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  flex-shrink: 0;
}

.friend-track-item .vis-tag.all {
  background: rgba(14, 165, 233, 0.18);
  border: 1px solid rgba(14, 165, 233, 0.4);
  color: #38bdf8;
}

.friend-track-item .vis-tag.friends {
  background: rgba(16, 185, 129, 0.18);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #34d399;
}

.track-chevron {
  color: #64748b;
  transition: transform 0.2s ease, color 0.15s ease;
  flex-shrink: 0;
}

.track-chevron.rotated {
  transform: rotate(180deg);
  color: #fb923c;
}

.friend-track-item .track-meta-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px 10px;
  font-size: 11px;
  color: #94a3b8;
  cursor: pointer;
}

.friend-track-item .meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.friend-track-item .meta-icon {
  color: #64748b;
}

.track-expanded-content {
  padding: 10px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.2);
}

.btn-track-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.btn-track-action.btn-view-map {
  background: rgba(249, 115, 22, 0.18);
  border: 1px solid rgba(249, 115, 22, 0.4);
  color: #fb923c;
}

.btn-track-action.btn-view-map:hover {
  background: rgba(249, 115, 22, 0.3);
  color: #ffedd5;
}

.stat-content {
  display: flex;
  flex-direction: column;
}

.stat-num {
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
  line-height: 1.1;
}

.stat-label {
  font-size: 10px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Seksjonsoverskrift */
.checkins-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  gap: 10px;
}

.title-with-count {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-with-count h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #cbd5e1;
}

.count-badge {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
}

.search-wrap {
  display: flex;
  align-items: center;
  position: relative;
  max-width: 150px;
}

.search-icon {
  position: absolute;
  left: 8px;
  color: #64748b;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 4px 8px 4px 24px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  color: #ffffff;
  font-size: 11px;
  outline: none;
}

.search-input:focus {
  border-color: #38bdf8;
}

/* Scroll-område */
.checkins-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding: 12px 20px calc(24px + env(safe-area-inset-bottom, 0px)) calc(20px + env(safe-area-inset-left, 0px));
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px 16px;
  color: #94a3b8;
  font-size: 13px;
  text-align: center;
  gap: 8px;
}

.checkins-month-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.month-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.month-items-list {
  animation: expand-fade 0.2s ease-out;
}

@keyframes expand-fade {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.checkins-accordion {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkin-item {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  overflow: hidden;
  transition: all 0.15s ease;
}

.checkin-item.expanded {
  border-color: rgba(56, 189, 248, 0.3);
  background: rgba(255, 255, 255, 0.06);
}

.checkin-header-btn {
  width: 100%;
  padding: 10px 12px;
  background: none;
  border: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  text-align: left;
}

.checkin-title-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.turpost-name {
  font-size: 13px;
  font-weight: 700;
  color: #f8fafc;
}

.vis-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.vis-tag.friends {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.vis-tag.all {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
}

.btn-friend-track-header {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.35);
  border-radius: 6px;
  color: #34d399;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-friend-track-header:hover {
  background: rgba(16, 185, 129, 0.28);
  color: #6ee7b7;
  border-color: rgba(16, 185, 129, 0.5);
}

.checkin-title-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkin-date {
  font-size: 11px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.chevron-icon {
  color: #64748b;
  transition: transform 0.2s ease;
}

.chevron-icon.rotated {
  transform: rotate(180deg);
  color: #38bdf8;
}

/* Ekspandert innhold */
.checkin-expanded-content {
  padding: 0 12px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkin-desc-bubble {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 8px 10px;
}

.checkin-desc-bubble p {
  margin: 0;
  font-size: 12px;
  color: #cbd5e1;
  line-height: 1.4;
  white-space: pre-wrap;
}

.checkin-photo-wrap {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
}

.photo-btn {
  position: relative;
  width: 100%;
  height: 180px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  overflow: hidden;
  border-radius: 8px;
}

.checkin-photo-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s ease;
}

.photo-btn:hover .checkin-photo-thumb {
  transform: scale(1.02);
}

.photo-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.photo-btn:hover .photo-overlay {
  opacity: 1;
}

.checkin-empty-detail {
  margin: 0;
  font-size: 11px;
  color: #64748b;
  font-style: italic;
  padding: 4px 0;
}

.checkin-actions-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
}

.btn-checkin-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #e2e8f0;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-checkin-action:hover {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.3);
  color: #ffffff;
}

.btn-checkin-action.track-action {
  color: #38bdf8;
  border-color: rgba(2, 132, 199, 0.35);
  background: rgba(2, 132, 199, 0.12);
}

.btn-checkin-action.track-action:hover {
  background: rgba(2, 132, 199, 0.22);
  color: #7dd3fc;
}

/* Lightbox */
.lightbox-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 11200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.lightbox-dialog {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
}

.lightbox-img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 8px;
}

.btn-lightbox-close {
  position: absolute;
  top: -14px;
  right: -14px;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  width: 32px;
  height: 32px;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.spin {
  animation: spin 1s linear infinite;
}

.text-sky {
  color: #38bdf8;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

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

.modal-fade-enter-active,
.modal-fade-appear-active {
  transition: opacity 0.32s ease;
}

.modal-fade-leave-active {
  transition: opacity 0.25s ease;
}

.modal-fade-enter-from,
.modal-fade-appear-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active .friend-profile-card,
.modal-fade-appear-active .friend-profile-card {
  animation: slideDrawerIn 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.modal-fade-leave-active .friend-profile-card {
  animation: slideDrawerOut 0.25s cubic-bezier(0.7, 0, 0.84, 0) forwards;
}

.lightbox-fade-enter-active,
.lightbox-fade-leave-active {
  transition: opacity 0.15s ease;
}

.lightbox-fade-enter-from,
.lightbox-fade-leave-to {
  opacity: 0;
}
</style>
