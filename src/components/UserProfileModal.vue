<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  X,
  LogOut,
  Mountain,
  Image as ImageIcon,
  CheckCircle2,
  Trophy,
  Maximize2,
  ShieldCheck,
  RotateCw,
  ChevronDown,
  Route,
  Star,
  ClipboardList,
  Loader2,
  Pencil
} from 'lucide-vue-next'
import { useAuth, type GoogleUser, type FirebaseCheckinItem } from '@/composables/useAuth'
import { usePrivateTurposter } from '@/composables/usePrivateTurposter'
import EditCheckinModal from './EditCheckinModal.vue'

const props = defineProps<{
  isOpen: boolean
  user: GoogleUser | null
  checkins: FirebaseCheckinItem[]
  isLoading?: boolean
  isAdmin?: boolean
  isAdminModeActive?: boolean
  savedTracksCount?: number
  mySpotsCount?: number
  spotSuggestionsCount?: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'logout'): void
  (e: 'refresh'): void
  (e: 'toggle-admin-mode'): void
  (e: 'open-saved-tracks'): void
  (e: 'open-my-spots'): void
  (e: 'open-spot-suggestions'): void
  (e: 'checkin-deleted', checkinId: string): void
  (e: 'checkin-updated'): void
}>()

const { deletePublicCheckin } = useAuth()
const { deletePrivateCheckin } = usePrivateTurposter()

const isActionLoading = ref<string | null>(null)
const editingCheckin = ref<FirebaseCheckinItem | null>(null)

function handleCheckinEdited(updatedItem: FirebaseCheckinItem) {
  emit('checkin-updated')
  editingCheckin.value = null
}

function handleCheckinDeleted(deletedId: string) {
  emit('checkin-deleted', deletedId)
  editingCheckin.value = null
}

async function handleDeleteCheckin(item: FirebaseCheckinItem) {
  if (!confirm('Er du sikker på at du vil slette denne innsjekkingen? Hvis den har et tilhørende bilde vil også bildet bli slettet.')) return

  isActionLoading.value = item.id
  try {
    if (item.isPrivate) {
      if (props.user) {
        await deletePrivateCheckin(props.user.userId, item.spotId || item.turpostId, item.id)
      }
    } else {
      await deletePublicCheckin({
        turpostId: item.turpostId,
        checkinId: item.id,
        timestamp: item.timestamp
      })
    }
    emit('checkin-deleted', item.id)
  } catch (err: any) {
    alert(err?.message || 'Kunne ikke slette innsjekkingen.')
  } finally {
    isActionLoading.value = null
  }
}

const isRefreshing = ref(false)

const handleForceRefresh = async () => {
  if (isRefreshing.value) return
  isRefreshing.value = true

  try {
    // 1. Tøm eventuell statisk app-cache (men spar på kart-tiles)
    if ('caches' in window) {
      const cacheNames = await caches.keys()
      await Promise.all(
        cacheNames
          .filter((name) => !name.includes('map-tiles'))
          .map((name) => caches.delete(name))
      )
    }

    // 2. Be service worker sjekke etter oppdatering og avregistrer for å sikre nyeste versjon
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      for (const reg of registrations) {
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
        await reg.update()
        await reg.unregister()
      }
    }
  } catch (err) {
    console.warn('Kunne ikke oppdatere cache fullstendig:', err)
  } finally {
    // 3. Tving en full reload fra serveren med cache-busting parameter
    const baseUrl = window.location.origin + window.location.pathname
    window.location.replace(`${baseUrl}?refresh=${Date.now()}`)
  }
}

// Sporer hvilke innsjekkinger som er ekspandert i listen
const expandedCheckinIds = ref<Set<string>>(new Set())

const toggleExpand = (id: string | number) => {
  const key = String(id)
  if (expandedCheckinIds.value.has(key)) {
    expandedCheckinIds.value.delete(key)
  } else {
    expandedCheckinIds.value.add(key)
  }
}

const isExpanded = (id: string | number): boolean => {
  return expandedCheckinIds.value.has(String(id))
}

// Lightbox for bildevisning
const lightboxImage = ref<string | null>(null)

// Sortert kronologisk – nyeste innsjekking øverst, deduplisert
const sortedCheckins = computed(() => {
  const map = new Map<string, FirebaseCheckinItem>()
  for (const c of props.checkins) {
    const key = c.id || `${c.turpostId}_${c.timestamp}`
    const existing = map.get(key)
    // Hvis samme innsjekking finnes to ganger (f.eks. både offentlig synk og privat node), prioriter den private
    if (!existing || (!existing.isPrivate && c.isPrivate)) {
      map.set(key, c)
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime() || 0
    const timeB = new Date(b.timestamp).getTime() || 0
    return timeB - timeA
  })
})

// Unike turposter
const uniqueTurpostIds = computed(() => {
  return new Set(sortedCheckins.value.map(c => String(c.turpostId)))
})

const formatDate = (isoString?: string) => {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return isoString
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${day}.${month}.${year} ${hours}:${minutes}`
  } catch {
    return isoString
  }
}

// Dra/flytte-logikk for profilmodalen
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
  () => props.isOpen,
  (open) => {
    if (open) {
      dragPosition.value = { x: 0, y: 0 }
    }
  }
)

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    if (lightboxImage.value) {
      lightboxImage.value = null
    } else if (props.isOpen) {
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
    <transition name="profile-modal-fade">
      <div v-if="isOpen" class="profile-modal-backdrop" @click.self="emit('close')">
        <div
          ref="modalRef"
          class="profile-modal-card glass-panel"
          :class="{ 'is-dragging': isDragging }"
          :style="modalStyle"
          role="dialog"
          aria-modal="true"
        >
          <!-- Header med brukerinfo og Lukk-knapp -->
          <div class="profile-modal-header" @pointerdown="startDrag" title="Klikk og dra for å flytte">
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

              <!-- Lukk-knapp oppe til høyre -->
              <button
                class="btn-profile-close"
                @click="emit('close')"
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
                class="btn-profile-refresh"
                :disabled="isRefreshing"
                @click="handleForceRefresh"
                title="Søk etter ny versjon og last inn på nytt"
              >
                <RotateCw :size="14" :class="{ 'spin-refresh': isRefreshing }" />
                <span>{{ isRefreshing ? 'Laster...' : 'Oppdater' }}</span>
              </button>

              <!-- Admin-modus toggle (kun synlig for admin-brukere) -->
              <button
                v-if="props.isAdmin"
                class="btn-admin-toggle"
                :class="{ active: props.isAdminModeActive }"
                @click="emit('toggle-admin-mode')"
                :title="props.isAdminModeActive ? 'Deaktiver admin-modus' : 'Aktiver admin-modus'"
              >
                <ShieldCheck :size="15" />
                <span>{{ props.isAdminModeActive ? 'Admin: PÅ' : 'Admin: AV' }}</span>
              </button>

              <!-- Logg ut -->
              <button
                class="btn-profile-logout"
                @click="emit('logout')"
                title="Logg ut av TorTur"
              >
                <LogOut :size="14" />
                <span>Logg ut</span>
              </button>
            </div>
          </div>

          <!-- Statistikk-striper (2 kolonner, kompakt) -->
          <div class="profile-stats-grid">
            <div class="stat-card">
              <div class="stat-icon-wrap trophy">
                <Trophy :size="18" />
              </div>
              <div class="stat-content">
                <span class="stat-number">{{ sortedCheckins.length }}</span>
                <span class="stat-label">Innsjekkinger</span>
              </div>
            </div>

            <div class="stat-card">
              <div class="stat-icon-wrap mountain">
                <Mountain :size="18" />
              </div>
              <div class="stat-content">
                <span class="stat-number">{{ uniqueTurpostIds.size }}</span>
                <span class="stat-label">Unike turposter</span>
              </div>
            </div>
          </div>

          <!-- Snarveier side om side: Mine GPS-spor og Mine turposter -->
          <div class="profile-shortcuts-grid">
            <!-- Snarvei til Mine GPS-spor -->
            <button
              class="profile-shortcut-card profile-tracks-card"
              @click="emit('open-saved-tracks'); emit('close')"
              title="Se og administrer dine lagrede GPS-spor"
            >
              <div class="shortcut-icon-wrap tracks-icon">
                <Route :size="17" />
              </div>
              <div class="shortcut-texts">
                <span class="shortcut-title">Mine GPS-spor</span>
                <span class="shortcut-sub">
                  {{ savedTracksCount || 0 }} {{ (savedTracksCount || 0) === 1 ? 'spor lagret' : 'spor lagret' }}
                </span>
              </div>
            </button>

            <!-- Snarvei til Mine turposter -->
            <button
              class="profile-shortcut-card profile-spots-card"
              @click="emit('open-my-spots'); emit('close')"
              title="Se og administrer dine egne turposter"
            >
              <div class="shortcut-icon-wrap spots-icon">
                <Star :size="17" />
              </div>
              <div class="shortcut-texts">
                <span class="shortcut-title">Mine turposter</span>
                <span class="shortcut-sub">
                  {{ mySpotsCount || 0 }} {{ (mySpotsCount || 0) === 1 ? 'privat turpost' : 'private turposter' }}
                </span>
              </div>
            </button>
          </div>

          <!-- For admin: Forslag turposter (kompakt) -->
          <button
            v-if="props.isAdmin"
            class="profile-suggestions-banner"
            @click="emit('open-spot-suggestions'); emit('close')"
            title="Se forslag til turposter"
          >
            <div class="profile-suggestions-left">
              <div class="shortcut-icon-wrap suggestions-icon">
                <ClipboardList :size="16" />
              </div>
              <span class="suggestions-title">Forslag turposter</span>
              <span v-if="spotSuggestionsCount" class="suggestions-count-badge">
                {{ spotSuggestionsCount }}
              </span>
            </div>
            <span class="suggestions-arrow">Vis forslag →</span>
          </button>

          <!-- Seksjonstitel -->
          <div class="section-divider">
            <span class="section-title">Mine besøkte turposter (nyeste øverst)</span>
            <span class="section-count">{{ sortedCheckins.length }} registrert</span>
          </div>

          <!-- Liste over innsjekkinger -->
          <div class="checkins-scroll-area">
            <!-- Laster -->
            <div v-if="isLoading" class="loading-state">
              <div class="spinner" />
              <span>Henter dine innsjekkinger...</span>
            </div>

            <!-- Tom tilstand -->
            <div v-else-if="sortedCheckins.length === 0" class="empty-state">
              <div class="empty-icon-wrap">
                <Mountain :size="32" />
              </div>
              <h4>Ingen innsjekkinger enda</h4>
              <p>Trykk på en turpost i kartet og velg «Sjekk inn her» for å registrere din første tur!</p>
            </div>

            <!-- Innsjekkingsliste (ekspanderbar) -->
            <div v-else class="checkin-cards-list">
              <div
                v-for="(item, idx) in sortedCheckins"
                :key="item.id || idx"
                class="user-checkin-card"
                :class="{ 'card-expanded': isExpanded(item.id || idx) }"
              >
                <div class="checkin-card-main">
                  <!-- Klikkbart hode: Viser turpostnavn, dato og pil -->
                  <div
                    class="checkin-card-header"
                    @click="toggleExpand(item.id || idx)"
                    title="Klikk for å vise/skjule detaljer og bilde"
                  >
                    <div class="turpost-name-row">
                      <CheckCircle2 :size="16" class="check-icon" />
                      <span
                        class="turpost-heading"
                        :title="item.turpostName || ('Turpost ' + item.turpostId)"
                      >
                        {{ item.turpostName || ('Turpost ' + item.turpostId) }}
                      </span>
                      <span v-if="item.isPrivate" class="private-badge-pill">Privat</span>
                    </div>
                    <div class="checkin-header-right">
                      <div class="checkin-date-badge">
                        <span>{{ formatDate(item.timestamp) }}</span>
                      </div>
                      <ChevronDown
                        :size="16"
                        class="chevron-expand"
                        :class="{ 'is-open': isExpanded(item.id || idx) }"
                      />
                    </div>
                  </div>

                  <!-- Ekspanderbare detaljer (notat og bilde) -->
                  <div
                    v-if="isExpanded(item.id || idx)"
                    class="checkin-card-details"
                  >
                    <p v-if="item.description" class="checkin-desc">
                      {{ item.description }}
                    </p>

                    <div v-if="item.imageUrl" class="checkin-photo-wrap">
                      <button
                        type="button"
                        class="photo-thumb-btn"
                        @click.stop="lightboxImage = item.imageUrl"
                        title="Klikk for å se bildet i fullskjerm"
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

                    <p
                      v-if="!item.description && !item.imageUrl"
                      class="checkin-empty-detail"
                    >
                      Ingen notat eller bilde registrert på denne turen.
                    </p>

                    <!-- Handlingsknapper for innsjekkingen -->
                    <div class="user-checkin-actions">
                      <button
                        type="button"
                        class="btn-checkin-action"
                        @click.stop="editingCheckin = item"
                        title="Rediger eller slett denne innsjekkingen"
                      >
                        <Pencil :size="12" />
                        <span>Edit</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Redigeringsmodal for innsjekking -->
        <EditCheckinModal
          :is-open="!!editingCheckin"
          :checkin="editingCheckin"
          :turpost-name="editingCheckin?.turpostName"
          :is-private="editingCheckin?.isPrivate"
          @close="editingCheckin = null"
          @saved="handleCheckinEdited"
          @deleted="handleCheckinDeleted"
        />

        <!-- Lightbox for fullskjermvisning av turbilder -->
        <transition name="lightbox-fade">
          <div
            v-if="lightboxImage"
            class="lightbox-backdrop"
            @click="lightboxImage = null"
          >
            <button
              class="btn-lightbox-close"
              @click.stop="lightboxImage = null"
              title="Lukk (Esc)"
              aria-label="Lukk bildevisning"
            >
              <X :size="24" />
            </button>
            <div class="lightbox-content" @click="lightboxImage = null">
              <img
                :src="lightboxImage"
                alt="Turbilde fullskjerm"
                class="lightbox-img"
                title="Trykk hvor som helst for å lukke"
              />
            </div>
            <button
              class="btn-lightbox-bottom-close"
              @click.stop="lightboxImage = null"
              title="Lukk bilde"
              aria-label="Lukk bildevisning"
            >
              <X :size="16" />
              <span>Lukk</span>
            </button>
          </div>
        </transition>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.profile-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.profile-modal-card {
  width: 100%;
  max-width: 580px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: rgba(26, 35, 50, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
  overflow: hidden;
  transition: box-shadow 0.2s ease;
}

.profile-modal-card.is-dragging {
  user-select: none;
  -webkit-user-select: none;
  transition: none !important;
  box-shadow: 0 35px 80px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.2);
}

/* Header */
.profile-modal-header {
  display: flex;
  flex-direction: column;
  padding: 16px 18px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(15, 23, 42, 0.5);
  gap: 12px;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.profile-modal-header:active,
.profile-modal-card.is-dragging .profile-modal-header {
  cursor: grabbing;
}

.profile-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
}

.profile-header-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
}

.user-info-row {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  flex: 1;
}

.user-avatar-wrap {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.user-avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(56, 189, 248, 0.6);
}

.user-avatar-fallback {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #334155;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-online-badge {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 13px;
  height: 13px;
  background: #10b981;
  border: 2px solid #1e293b;
  border-radius: 50%;
}

.user-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-name {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-email {
  font-size: 12px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.btn-admin-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(100, 116, 139, 0.15);
  border: 1px solid rgba(100, 116, 139, 0.35);
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-admin-toggle:hover {
  background: rgba(247, 201, 72, 0.15);
  border-color: rgba(247, 201, 72, 0.4);
  color: #f7c948;
}

.btn-admin-toggle.active {
  background: rgba(247, 201, 72, 0.18);
  border: 1px solid rgba(247, 201, 72, 0.55);
  color: #f7c948;
}

.btn-admin-toggle.active:hover {
  background: rgba(247, 201, 72, 0.28);
  border-color: rgba(247, 201, 72, 0.75);
}

.btn-profile-refresh {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #38bdf8;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-profile-refresh:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.25);
  border-color: rgba(56, 189, 248, 0.6);
  color: #ffffff;
}

.btn-profile-refresh:disabled {
  opacity: 0.6;
  cursor: wait;
}

.spin-refresh {
  animation: spin-cw 1s linear infinite;
}

@keyframes spin-cw {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.btn-profile-logout {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-profile-logout:hover {
  background: rgba(239, 68, 68, 0.3);
  color: #ffffff;
  border-color: rgba(239, 68, 68, 0.6);
}

.btn-profile-close {
  background: rgba(255, 255, 255, 0.08);
  border: none;
  color: #94a3b8;
  width: 32px;
  height: 32px;
  border-radius: 8px;
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

/* Statistikk */
.profile-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 8px 16px;
  background: rgba(15, 23, 42, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 8px 12px;
  border-radius: 12px;
}

.stat-icon-wrap {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
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
  min-width: 0;
}

.stat-number {
  font-size: 15px;
  font-weight: 700;
  color: #f8fafc;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-label {
  font-size: 10px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}

/* Snarveier (Mine GPS-spor og Mine turposter side om side) */
.profile-shortcuts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin: 8px 16px 0 16px;
}

.profile-shortcut-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
  border: 1px solid transparent;
  min-width: 0;
}

.profile-tracks-card {
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.12), rgba(15, 23, 42, 0.8));
  border-color: rgba(249, 115, 22, 0.35);
}

.profile-tracks-card:hover {
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.22), rgba(15, 23, 42, 0.9));
  border-color: #f97316;
  transform: translateY(-1px);
}

.profile-spots-card {
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.12), rgba(15, 23, 42, 0.8));
  border-color: rgba(168, 85, 247, 0.35);
}

.profile-spots-card:hover {
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.22), rgba(15, 23, 42, 0.9));
  border-color: #a855f7;
  transform: translateY(-1px);
}

.shortcut-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.shortcut-icon-wrap.tracks-icon {
  background: rgba(249, 115, 22, 0.2);
  color: #f97316;
}

.shortcut-icon-wrap.spots-icon {
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
}

.shortcut-icon-wrap.suggestions-icon {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}

.shortcut-texts {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.shortcut-title {
  font-size: 12px;
  font-weight: 700;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shortcut-sub {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Snarvei-banner for Forslag turposter (kompakt) */
.profile-suggestions-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 6px 16px 0 16px;
  padding: 8px 12px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(15, 23, 42, 0.8));
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
  width: calc(100% - 32px);
}

.profile-suggestions-banner:hover {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(15, 23, 42, 0.9));
  border-color: #f59e0b;
  transform: translateY(-1px);
}

.profile-suggestions-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.suggestions-title {
  font-size: 13px;
  font-weight: 700;
  color: #f8fafc;
}

.suggestions-count-badge {
  background: #f59e0b;
  color: #0f172a;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
}

.suggestions-arrow {
  font-size: 12px;
  font-weight: 600;
  color: #f59e0b;
}

/* Seksjonslinje */
.section-divider {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 6px;
  font-size: 12px;
}

.section-title {
  color: #cbd5e1;
  font-weight: 600;
}

.section-count {
  color: #64748b;
  font-size: 11px;
}

/* Scroll-område */
.checkins-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding: 8px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  color: #94a3b8;
}

.empty-icon-wrap {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  margin-bottom: 12px;
}

.empty-state h4 {
  margin: 0 0 6px;
  font-size: 15px;
  color: #e2e8f0;
}

.empty-state p {
  margin: 0;
  font-size: 12px;
  max-width: 320px;
  line-height: 1.5;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Innsjekkingskort */
.checkin-cards-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.user-checkin-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px 14px;
  transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}

.user-checkin-card:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(16, 185, 129, 0.35);
  transform: translateY(-1px);
}

.checkin-card-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkin-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  min-width: 0;
}

.checkin-header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.chevron-expand {
  color: #94a3b8;
  transition: transform 0.2s ease, color 0.2s ease;
  flex-shrink: 0;
}

.chevron-expand.is-open {
  transform: rotate(180deg);
  color: #38bdf8;
}

.checkin-card-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  margin-top: 2px;
  animation: expand-fade 0.2s ease;
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

.checkin-empty-detail {
  font-size: 12px;
  color: #64748b;
  font-style: italic;
  margin: 0;
  padding: 4px 0;
}

.turpost-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.check-icon {
  color: #10b981;
  flex-shrink: 0;
}

.turpost-heading {
  font-size: 14px;
  font-weight: 700;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.private-badge-pill {
  font-size: 10px;
  font-weight: 600;
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.4);
  padding: 1px 5px;
  border-radius: 4px;
  flex-shrink: 0;
}

.user-checkin-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 8px;
  margin-top: 4px;
  border-top: 1px dashed rgba(255, 255, 255, 0.08);
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

.btn-checkin-action:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.3);
  color: #ffffff;
}

.btn-checkin-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-checkin-action.danger-subtle {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
}

.btn-checkin-action.danger-subtle:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.18);
  border-color: rgba(239, 68, 68, 0.4);
}

.btn-checkin-action.danger {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: #f87171;
  margin-left: auto;
}

.btn-checkin-action.danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.3);
  border-color: #ef4444;
  color: #fef2f2;
}

.checkin-date-badge {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.04);
  padding: 3px 6px;
  border-radius: 6px;
  white-space: nowrap;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.checkin-desc {
  margin: 0;
  font-size: 13px;
  color: #cbd5e1;
  line-height: 1.45;
  background: rgba(0, 0, 0, 0.2);
  padding: 8px 10px;
  border-radius: 8px;
  border-left: 2px solid #10b981;
}

.checkin-photo-wrap {
  margin-top: 4px;
}

.photo-thumb-btn {
  position: relative;
  display: block;
  width: 110px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 0;
  background: #0f172a;
  cursor: pointer;
}

.checkin-photo-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s ease;
}

.photo-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.photo-thumb-btn:hover .photo-overlay {
  opacity: 1;
}

.photo-thumb-btn:hover .checkin-photo-thumb {
  transform: scale(1.06);
}

/* Lightbox */
.lightbox-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10001;
  background: rgba(0, 0, 0, 0.94);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: calc(max(16px, env(safe-area-inset-top, 0px)) + 64px);
  padding-bottom: calc(max(16px, env(safe-area-inset-bottom, 0px)) + 64px);
  padding-left: calc(max(16px, env(safe-area-inset-left, 0px)));
  padding-right: calc(max(16px, env(safe-area-inset-right, 0px)));
  box-sizing: border-box;
  touch-action: manipulation;
  cursor: pointer;
}

.lightbox-content {
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  max-height: 100%;
}

.lightbox-img {
  max-width: 95vw;
  max-height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 150px);
  object-fit: contain;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.85);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.btn-lightbox-close {
  position: absolute;
  top: calc(max(16px, env(safe-area-inset-top, 0px)) + 12px);
  right: calc(max(16px, env(safe-area-inset-right, 0px)) + 12px);
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #ffffff;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 20;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  transition: all 0.2s ease;
  touch-action: manipulation;
}

.btn-lightbox-close:hover {
  background: rgba(30, 41, 59, 0.95);
  border-color: rgba(255, 255, 255, 0.5);
  transform: scale(1.05);
}

.btn-lightbox-close:active {
  transform: scale(0.95);
  background: rgba(56, 189, 248, 0.35);
}

.btn-lightbox-bottom-close {
  position: absolute;
  bottom: calc(max(16px, env(safe-area-inset-bottom, 0px)) + 14px);
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 9999px;
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  z-index: 20;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  transition: all 0.2s ease;
  touch-action: manipulation;
}

.btn-lightbox-bottom-close:hover {
  background: rgba(30, 41, 59, 0.95);
  border-color: rgba(255, 255, 255, 0.5);
}

.btn-lightbox-bottom-close:active {
  transform: translateX(-50%) scale(0.96);
  background: rgba(56, 189, 248, 0.35);
}

@media (max-height: 600px) {
  .lightbox-backdrop {
    padding-top: calc(max(10px, env(safe-area-inset-top, 0px)) + 48px);
    padding-bottom: calc(max(10px, env(safe-area-inset-bottom, 0px)) + 48px);
  }
  .lightbox-img {
    max-height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 100px);
  }
}

/* Animasjoner */
.profile-modal-fade-enter-active,
.profile-modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.profile-modal-fade-enter-from,
.profile-modal-fade-leave-to {
  opacity: 0;
}

.lightbox-fade-enter-active,
.lightbox-fade-leave-active {
  transition: opacity 0.2s ease;
}

.lightbox-fade-enter-from,
.lightbox-fade-leave-to {
  opacity: 0;
}


</style>
