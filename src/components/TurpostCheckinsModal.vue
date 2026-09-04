<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import { Mountain, X, Check, Loader2, Calendar, MapPin, Plus, User, Image as ImageIcon } from 'lucide-vue-next'
import type { TurpostItem } from '@/composables/useTurposter'
import { useAuth, type FirebaseCheckinItem } from '@/composables/useAuth'
import {
  type GeoLocationState,
  calculateDistanceMeters,
  formatDistance,
  MAX_CHECKIN_DISTANCE_METERS
} from '@/composables/useGeolocation'

const props = defineProps<{
  isOpen: boolean
  turpost: TurpostItem | null
  isLoggedIn: boolean
  hasVisited: boolean
  currentUserId?: string
  userLocation?: GeoLocationState | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open-checkin', post: TurpostItem): void
}>()

const { fetchTurpostCheckins } = useAuth()

const checkins = ref<FirebaseCheckinItem[]>([])
const isLoading = ref(false)
const selectedImage = ref<string | null>(null)

// Formatere dato til norsk tekst
const formatDate = (isoString: string) => {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    return d.toLocaleDateString('no-NO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return isoString
  }
}

// Sorter etter nyeste først
const sortedCheckins = computed(() => {
  return [...checkins.value].sort((a, b) => {
    const timeA = new Date(a.timestamp || 0).getTime()
    const timeB = new Date(b.timestamp || 0).getTime()
    return timeB - timeA
  })
})

// Avstand til turposten
const distance = computed(() => {
  if (!props.userLocation || !props.turpost) return null
  return calculateDistanceMeters(
    props.userLocation.lat,
    props.userLocation.lng,
    props.turpost.lat,
    props.turpost.lng
  )
})

const isWithinRange = computed(() => {
  return distance.value !== null && distance.value <= MAX_CHECKIN_DISTANCE_METERS
})

const loadCheckins = async () => {
  if (!props.turpost) return
  isLoading.value = true
  checkins.value = []

  try {
    const data = await fetchTurpostCheckins(props.turpost.id)
    checkins.value = data
  } catch (err) {
    console.error('[TurpostCheckinsModal] Feil ved lasting:', err)
  } finally {
    isLoading.value = false
  }
}

// Dra/flytte-logikk for modalen
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
  if (e.button !== 0) return // Kun primær museknapp / touch

  const target = e.target as HTMLElement | null
  // Ikke start draing hvis brukeren klikker på knapper eller interaktive elementer
  if (target?.closest('button') || target?.closest('a') || target?.closest('input')) {
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

watch(
  () => [props.isOpen, props.turpost?.id],
  ([open]) => {
    if (open && props.turpost) {
      selectedImage.value = null
      dragPosition.value = { x: 0, y: 0 }
      loadCheckins()
    }
  },
  { immediate: true }
)

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.isOpen) {
    if (selectedImage.value) {
      selectedImage.value = null
    } else {
      emit('close')
    }
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
    <Transition name="fade">
      <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
        <div
          ref="modalRef"
          class="checkins-card glass-panel"
          :class="{ 'is-dragging': isDragging }"
          :style="modalStyle"
          role="dialog"
          aria-modal="true"
        >
          <!-- Header (klikk og dra for å flytte modalen) -->
          <div class="card-header" @pointerdown="startDrag" title="Klikk og dra for å flytte">
            <div class="header-left">
              <div class="post-badge" :class="{ 'is-visited': hasVisited }">
                <Mountain :size="20" />
              </div>
              <div class="header-text">
                <h3 class="post-title">{{ turpost?.name || 'Turpost' }}</h3>
                <div class="post-meta">
                  <span v-if="turpost?.alt" class="meta-alt">⛰️ {{ turpost.alt }} moh.</span>
                  <span v-if="turpost?.lat && turpost?.lng" class="meta-coords">📍 {{ turpost.lat.toFixed(4) }}°, {{ turpost.lng.toFixed(4) }}°</span>
                </div>
              </div>
            </div>
            <button class="btn-close" @click="emit('close')" title="Lukk (Esc)" aria-label="Lukk">
              <X :size="18" />
            </button>
          </div>

          <!-- Brukerstatus & Hurtiginnsjekk -->
          <div class="status-action-row">
            <div class="visit-status" :class="{ 'is-visited': hasVisited }">
              <Check v-if="hasVisited" :size="16" class="status-icon" />
              <MapPin v-else :size="16" class="status-icon" />
              <span>
                {{ hasVisited ? 'Du har sjekket inn på denne turposten!' : 'Du har ikke besøkt denne posten enda' }}
              </span>
            </div>

            <div class="checkin-quick-wrap" v-if="isLoggedIn && turpost">
              <span
                class="distance-status-pill"
                :class="{
                  'in-range': isWithinRange,
                  'out-of-range': distance !== null && !isWithinRange,
                  'no-location': distance === null
                }"
              >
                {{ distance !== null ? formatDistance(distance) : 'Posisjon ukjent' }}
              </span>

              <button
                type="button"
                class="btn-checkin-quick"
                :class="{ disabled: !isWithinRange }"
                :disabled="!isWithinRange"
                :title="!isWithinRange ? 'Du må være innen 100m fra turposten for å sjekke inn' : 'Sjekk inn'"
                @click="isWithinRange && emit('open-checkin', turpost)"
              >
                <Plus :size="16" />
                <span>{{ isWithinRange ? 'Sjekk inn' : 'For langt unna' }}</span>
              </button>
            </div>
          </div>

          <!-- Innsjekkingsliste -->
          <div class="checkins-content scrollable">
            <div v-if="isLoading" class="loading-state">
              <Loader2 class="spinner" :size="28" />
              <span>Henter innsjekkinger...</span>
            </div>

            <div v-else-if="sortedCheckins.length === 0" class="empty-state">
              <div class="empty-icon">🏔️</div>
              <h4>Ingen innsjekkinger enda</h4>
              <p>Vær den aller første til å sjekke inn på {{ turpost?.name }}!</p>
              <button
                v-if="isLoggedIn && turpost"
                type="button"
                class="btn-first-checkin"
                :class="{ disabled: !isWithinRange }"
                :disabled="!isWithinRange"
                :title="!isWithinRange ? 'Du må være innen 100m fra turposten for å sjekke inn' : 'Sjekk inn her'"
                @click="isWithinRange && emit('open-checkin', turpost)"
              >
                📍 {{ isWithinRange ? 'Sjekk inn nå' : 'For langt unna (maks 100m)' }}
              </button>
            </div>

            <div v-else class="checkins-list">
              <div class="list-header">
                <span class="count-pill">{{ sortedCheckins.length }} innsjekking{{ sortedCheckins.length === 1 ? '' : 'er' }}</span>
              </div>

              <div
                v-for="item in sortedCheckins"
                :key="item.id"
                class="checkin-item"
                :class="{ 'is-own': item.userId === currentUserId }"
              >
                <div class="item-header">
                  <div class="user-meta">
                    <img
                      v-if="item.userAvatar"
                      :src="item.userAvatar"
                      :alt="item.userName"
                      class="avatar-img"
                    />
                    <div v-else class="avatar-fallback">
                      <User :size="16" />
                    </div>
                    <div class="user-details">
                      <span class="name">
                        {{ item.userName || 'Turgåer' }}
                        <span v-if="item.userId === currentUserId" class="own-tag">Deg</span>
                      </span>
                      <span class="date">
                        <Calendar :size="12" />
                        {{ formatDate(item.timestamp) }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Beskrivelse -->
                <p v-if="item.description" class="item-desc">{{ item.description }}</p>

                <!-- Bilde -->
                <div v-if="item.imageUrl" class="item-photo-wrap" @click="selectedImage = item.imageUrl">
                  <img :src="item.imageUrl" alt="Bilde fra turposten" class="item-photo" loading="lazy" />
                  <div class="photo-overlay">
                    <span>🔍 Vis full størrelse</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Bilde-lightbox -->
        <Transition name="fade">
          <div v-if="selectedImage" class="lightbox-overlay" @click.self="selectedImage = null">
            <button class="btn-close-lightbox" @click="selectedImage = null" title="Lukk (Esc)">
              <X :size="24" />
            </button>
            <img :src="selectedImage" alt="Forstørret turbilde" class="lightbox-img" />
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: 16px;
  box-sizing: border-box;
}

.checkins-card {
  width: 100%;
  max-width: 500px;
  max-height: 85vh;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  color: #f8fafc;
  overflow: hidden;
  transition: box-shadow 0.2s ease;
}

.checkins-card.is-dragging {
  user-select: none;
  -webkit-user-select: none;
  box-shadow: 0 35px 80px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.2);
}

/* Header */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.02);
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.card-header:active,
.checkins-card.is-dragging .card-header {
  cursor: grabbing;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.post-badge {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
}

.post-badge.is-visited {
  background: linear-gradient(135deg, #10b981, #059669);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

.header-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.post-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.post-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #94a3b8;
  margin-top: 2px;
}

.meta-alt {
  color: #38bdf8;
  font-weight: 600;
}

.btn-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.btn-close:hover {
  background: rgba(255, 255, 255, 0.18);
  color: #ffffff;
}

/* Status & Action Row */
.status-action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.visit-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
}

.visit-status.is-visited {
  color: #34d399;
}

.status-icon {
  flex-shrink: 0;
}

.checkin-quick-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.distance-status-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  white-space: nowrap;
}

.distance-status-pill.in-range {
  background: rgba(34, 197, 94, 0.15);
  color: #86efac;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.distance-status-pill.out-of-range {
  background: rgba(245, 158, 11, 0.15);
  color: #fcd34d;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.distance-status-pill.no-location {
  background: rgba(148, 163, 184, 0.15);
  color: #cbd5e1;
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.btn-checkin-quick {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: linear-gradient(135deg, #0284c7, #2563eb);
  color: #ffffff;
  border: 1px solid #38bdf8;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.btn-checkin-quick:hover:not(:disabled) {
  background: linear-gradient(135deg, #0369a1, #1d4ed8);
  transform: translateY(-1px);
}

.btn-checkin-quick:disabled,
.btn-checkin-quick.disabled {
  background: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  border-color: rgba(255, 255, 255, 0.12);
  cursor: not-allowed;
  transform: none;
}

/* Content */
.checkins-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

/* Loading state */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  gap: 12px;
  color: #94a3b8;
  font-size: 13px;
}

.spinner {
  animation: spin 1s linear infinite;
  color: #38bdf8;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 16px;
  gap: 8px;
}

.empty-icon {
  font-size: 38px;
  margin-bottom: 4px;
}

.empty-state h4 {
  margin: 0;
  font-size: 16px;
  color: #f8fafc;
}

.empty-state p {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
  max-width: 280px;
}

.btn-first-checkin {
  margin-top: 12px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #0284c7, #2563eb);
  color: white;
  border: 1px solid #38bdf8;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-first-checkin:hover:not(:disabled) {
  transform: translateY(-1px);
  background: linear-gradient(135deg, #0369a1, #1d4ed8);
}

.btn-first-checkin:disabled,
.btn-first-checkin.disabled {
  background: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  border-color: rgba(255, 255, 255, 0.12);
  cursor: not-allowed;
  transform: none;
}

/* Checkins List */
.list-header {
  margin-bottom: 12px;
}

.count-pill {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  padding: 3px 8px;
  border-radius: 6px;
}

.checkins-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.checkin-item {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: border-color 0.2s ease;
}

.checkin-item.is-own {
  border-color: rgba(56, 189, 248, 0.35);
  background: rgba(2, 132, 199, 0.06);
}

.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.user-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar-img {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-fallback {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #cbd5e1;
}

.user-details {
  display: flex;
  flex-direction: column;
}

.user-details .name {
  font-size: 13px;
  font-weight: 700;
  color: #f8fafc;
  display: flex;
  align-items: center;
  gap: 6px;
}

.own-tag {
  font-size: 10px;
  font-weight: 600;
  background: #0284c7;
  color: #ffffff;
  padding: 1px 5px;
  border-radius: 4px;
}

.user-details .date {
  font-size: 11px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 1px;
}

.item-desc {
  margin: 0;
  font-size: 13px;
  color: #e2e8f0;
  line-height: 1.45;
  white-space: pre-wrap;
}

.item-photo-wrap {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  max-height: 200px;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.item-photo {
  width: 100%;
  max-height: 200px;
  object-fit: cover;
  display: block;
  transition: transform 0.2s ease;
}

.item-photo-wrap:hover .item-photo {
  transform: scale(1.02);
}

.photo-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 6px 10px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
  font-size: 11px;
  color: #ffffff;
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.item-photo-wrap:hover .photo-overlay {
  opacity: 1;
}

/* Lightbox */
.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 1400;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.lightbox-img {
  max-width: 95vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 10px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8);
}

.btn-close-lightbox {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  color: white;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s ease;
}

.btn-close-lightbox:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* Scrollbar */
.scrollable::-webkit-scrollbar {
  width: 6px;
}
.scrollable::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
