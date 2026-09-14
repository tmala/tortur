<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import {
  X,
  Users,
  Trophy,
  Mountain,
  Calendar,
  ChevronDown,
  Maximize2,
  Loader2,
  Map as MapIcon,
  Globe,
  Search,
  Route,
} from 'lucide-vue-next'
import type { FirebaseCheckinItem } from '@/composables/useAuth'
import { useFriends, type FriendUser } from '@/composables/useFriends'
import { useGpsTrackStore } from '@/stores/gpsTrack'
import { useFirebaseTracks } from '@/composables/useFirebaseTracks'
import CheckinSocialSection from './CheckinSocialSection.vue'

const props = defineProps<{
  isOpen: boolean
  friend: FriendUser | null
  currentUserId?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'view-turpost-on-map', checkin: FirebaseCheckinItem): void
}>()

const { fetchFriendCheckins } = useFriends()

const checkins = ref<FirebaseCheckinItem[]>([])
const isLoading = ref(false)
const searchQuery = ref('')
// Sporer hvilke innsjekkinger som er manuelt ekspandert i listen.
// Som standard er alle innsjekkinger minimert (ikke ekspandert).
const expandedCheckinIds = ref<Set<string>>(new Set())
const lightboxImage = ref<string | null>(null)

// Dragging
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
    transform: `translate3d(${dragPosition.value.x}px, ${dragPosition.value.y}px, 0)`,
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
  const dx = e.clientX - dragStart.x
  const dy = e.clientY - dragStart.y
  dragPosition.value = {
    x: initialPosition.x + dx,
    y: initialPosition.y + dy,
  }
}

const onDragEnd = () => {
  isDragging.value = false
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
}

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

watch(
  () => [props.isOpen, props.friend?.userId],
  ([newOpen, newFriendId]) => {
    if (newOpen && newFriendId) {
      dragPosition.value = { x: 0, y: 0 }
      searchQuery.value = ''
      expandedCheckinIds.value.clear()
      loadCheckins()
    }
  },
  { immediate: true },
)

const uniqueTurpostIds = computed(() => {
  return new Set(checkins.value.map((c) => String(c.turpostId)))
})

const filteredCheckins = computed(() => {
  if (!searchQuery.value.trim()) return checkins.value
  const q = searchQuery.value.toLowerCase().trim()
  return checkins.value.filter(
    (c) =>
      (c.turpostName && c.turpostName.toLowerCase().includes(q)) ||
      (c.description && c.description.toLowerCase().includes(q)),
  )
})

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
  emit('close')
}

async function handleViewTrack(item: FirebaseCheckinItem) {
  if (!item.trackId) return
  const trackStore = useGpsTrackStore()
  const local = trackStore.savedTracks.find((t) => t.id === item.trackId)
  if (local) {
    trackStore.viewTrackOnMap(local)
  } else {
    const { fetchUserTrackById } = useFirebaseTracks()
    const remote = await fetchUserTrackById(item.userId, item.trackId)
    if (remote) {
      trackStore.viewTrackOnMap(remote)
    } else {
      trackStore.viewTrackOnMap(item.trackId)
    }
  }
  emit('close')
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

onUnmounted(() => {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
})
</script>

<template>
  <transition name="modal-fade">
    <div v-if="isOpen && friend" class="friend-profile-backdrop" @click="emit('close')">
      <div
        ref="modalRef"
        class="friend-profile-card glass-panel"
        :class="{ 'is-dragging': isDragging }"
        :style="modalStyle"
        @click.stop
      >
        <!-- Modal Header (Draggable) -->
        <div class="card-header" @pointerdown="startDrag">
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

          <button type="button" class="btn-close" title="Lukk" @click="emit('close')">
            <X :size="18" />
          </button>
        </div>

        <!-- Statistikk-brikker -->
        <div class="stats-row">
          <div class="stat-box">
            <div class="stat-icon-wrap trophy">
              <Trophy :size="20" />
            </div>
            <div class="stat-content">
              <span class="stat-num">{{ checkins.length }}</span>
              <span class="stat-label">Innsjekkinger</span>
            </div>
          </div>

          <div class="stat-box">
            <div class="stat-icon-wrap mountain">
              <Mountain :size="20" />
            </div>
            <div class="stat-content">
              <span class="stat-num">{{ uniqueTurpostIds.size }}</span>
              <span class="stat-label">Unike turposter</span>
            </div>
          </div>
        </div>

        <!-- Innsjekkinger seksjon -->
        <div class="checkins-section-header">
          <div class="title-with-count">
            <h4>Synlige innsjekkinger</h4>
            <span class="count-badge">{{ filteredCheckins.length }}</span>
          </div>

          <!-- Søkefelt hvis flere enn 3 innsjekkinger -->
          <div v-if="checkins.length > 3" class="search-wrap">
            <Search :size="12" class="search-icon" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Filtrer turer..."
              class="search-input"
            />
          </div>
        </div>

        <!-- Scroll-område for innsjekkinger -->
        <div class="checkins-scroll-area">
          <div v-if="isLoading" class="loading-state">
            <Loader2 :size="24" class="spin text-sky" />
            <span>Laster {{ friend.userName }}s turer...</span>
          </div>

          <div v-else-if="filteredCheckins.length === 0" class="empty-state">
            <p v-if="searchQuery">Ingen turer matchet søket «{{ searchQuery }}».</p>
            <p v-else>{{ friend.userName }} har ingen delte innsjekkinger enda.</p>
          </div>

          <div v-else class="checkins-accordion">
            <div
              v-for="item in filteredCheckins"
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
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 11000;
  padding: 16px;
}

.friend-profile-card {
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  background: rgba(15, 23, 42, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.7);
  overflow: hidden;
  user-select: none;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  cursor: grab;
}

.card-header:active {
  cursor: grabbing;
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
  padding: 12px 16px;
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

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
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
