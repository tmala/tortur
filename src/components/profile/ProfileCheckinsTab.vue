<script setup lang="ts">
import { ref, computed } from 'vue'
import { Mountain, X } from 'lucide-vue-next'
import type { FirebaseCheckinItem } from '@/composables/useAuth'
import EditCheckinModal from '../EditCheckinModal.vue'
import UserCheckinCard from './UserCheckinCard.vue'
import MonthGroupHeader from '../MonthGroupHeader.vue'
import { useMonthGroups } from '@/composables/useMonthGroups'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'

const props = withDefaults(
  defineProps<{
    checkins: FirebaseCheckinItem[]
    isLoading?: boolean
    currentUserId?: string
  }>(),
  {
    isLoading: false,
    currentUserId: undefined,
  },
)

const emit = defineEmits<{
  (e: 'view-turpost-on-map', checkin: FirebaseCheckinItem): void
  (e: 'view-track', checkin: FirebaseCheckinItem): void
  (e: 'checkin-updated'): void
  (e: 'checkin-deleted', checkinId: string): void
}>()

const editingCheckin = ref<FirebaseCheckinItem | null>(null)
const lightboxImage = ref<string | null>(null)
const expandedCheckinIds = ref<Set<string>>(new Set())

const isExpanded = (id: string | number): boolean => {
  return expandedCheckinIds.value.has(String(id))
}

const toggleExpand = (id: string | number) => {
  const key = String(id)
  const next = new Set(expandedCheckinIds.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  expandedCheckinIds.value = next
}

// Sortert kronologisk – nyeste innsjekking øverst, deduplisert
const sortedCheckins = computed(() => {
  const map = new Map<string, FirebaseCheckinItem>()
  for (const c of props.checkins) {
    const key = c.id || `${c.turpostId}_${c.timestamp}`
    const existing = map.get(key)
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

const {
  monthGroups,
  isMonthExpanded,
  toggleMonth,
} = useMonthGroups(sortedCheckins, {
  getDate: (item) => item.timestamp,
})

function handleViewOnMap(item: FirebaseCheckinItem) {
  emit('view-turpost-on-map', item)
}

function handleViewTrack(item: FirebaseCheckinItem) {
  emit('view-track', item)
}

function handleCheckinEdited() {
  emit('checkin-updated')
  editingCheckin.value = null
}

function handleSocialUpdated() {
  emit('checkin-updated')
}

function handleCheckinDeleted(deletedId: string) {
  emit('checkin-deleted', deletedId)
  editingCheckin.value = null
}
</script>

<template>
  <div class="profile-checkins-tab">
    <!-- Seksjonstittel -->
    <div class="section-divider">
      <span class="section-title">Mine besøkte turposter (nyeste øverst)</span>
      <span class="section-count">{{ sortedCheckins.length }} registrert</span>
    </div>

    <!-- Scroll-område for innsjekkinger -->
    <div class="checkins-scroll-area">
      <!-- Laster -->
      <LoadingSpinner
        v-if="isLoading"
        label="Henter dine innsjekkinger..."
      />

      <!-- Tom tilstand -->
      <div v-else-if="sortedCheckins.length === 0" class="empty-state">
        <div class="empty-icon-wrap">
          <Mountain :size="32" />
        </div>
        <h4>Ingen innsjekkinger enda</h4>
        <p>
          Trykk på en turpost i kartet og velg «Sjekk inn her» for å registrere din første tur!
        </p>
      </div>

      <!-- Innsjekkingsliste (månedsgruppert) -->
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

          <div v-if="isMonthExpanded(group.key)" class="month-items-list checkin-cards-list">
            <UserCheckinCard
              v-for="(item, idx) in group.items"
              :key="item.id || `${group.key}-${idx}`"
              :item="item"
              :is-expanded="isExpanded(item.id || `${group.key}-${idx}`)"
              :current-user-id="props.currentUserId"
              @toggle-expand="toggleExpand(item.id || `${group.key}-${idx}`)"
              @view-on-map="handleViewOnMap"
              @view-track="handleViewTrack"
              @edit="editingCheckin = $event"
              @view-photo="lightboxImage = $event"
              @social-updated="handleSocialUpdated"
            />
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
      <div v-if="lightboxImage" class="lightbox-backdrop" @click="lightboxImage = null">
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
</template>

<style scoped>
.profile-checkins-tab {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Seksjonslinje */
.section-divider {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 6px;
  font-size: 12px;
  flex-shrink: 0;
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
  padding: 6px 16px calc(24px + env(safe-area-inset-bottom, 0px));
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

.checkin-cards-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
  padding: calc(max(16px, env(safe-area-inset-top, 0px)) + 64px) 16px
    calc(max(16px, env(safe-area-inset-bottom, 0px)) + 64px);
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
  max-height: calc(
    100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 150px
  );
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
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #ffffff;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-lightbox-close:hover {
  background: rgba(30, 41, 59, 0.95);
  transform: scale(1.05);
}

.btn-lightbox-bottom-close {
  position: absolute;
  bottom: calc(max(16px, env(safe-area-inset-bottom, 0px)) + 16px);
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #ffffff;
  padding: 8px 18px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-lightbox-bottom-close:hover {
  background: rgba(30, 41, 59, 0.95);
  transform: scale(1.03);
}

.lightbox-fade-enter-active,
.lightbox-fade-leave-active {
  transition: opacity 0.2s ease;
}

.lightbox-fade-enter-from,
.lightbox-fade-leave-to {
  opacity: 0;
}

@media (max-width: 480px) {
  .section-divider {
    padding: 8px 14px 4px;
  }

  .checkins-scroll-area {
    padding: 4px 12px calc(20px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
