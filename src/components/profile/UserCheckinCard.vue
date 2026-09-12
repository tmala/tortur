<script setup lang="ts">
import {
  CheckCircle2,
  ChevronDown,
  Globe,
  Lock,
  Map as MapIcon,
  Maximize2,
  Pencil,
  Users,
} from 'lucide-vue-next'
import type { FirebaseCheckinItem } from '@/composables/useAuth'
import CheckinSocialSection from '../CheckinSocialSection.vue'

const props = defineProps<{
  item: FirebaseCheckinItem
  isExpanded: boolean
  currentUserId?: string
}>()

const emit = defineEmits<{
  (e: 'toggle-expand'): void
  (e: 'view-on-map', item: FirebaseCheckinItem): void
  (e: 'edit', item: FirebaseCheckinItem): void
  (e: 'view-photo', url: string): void
  (e: 'social-updated', updatedItem: FirebaseCheckinItem): void
}>()

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
</script>

<template>
  <div class="user-checkin-card" :class="{ 'card-expanded': isExpanded }">
    <div class="checkin-card-main">
      <!-- Klikkbart hode: Viser turpostnavn, dato og pil -->
      <div
        class="checkin-card-header"
        @click="emit('toggle-expand')"
        title="Klikk for å vise/skjule detaljer og bilde"
      >
        <div class="turpost-name-row">
          <CheckCircle2 :size="16" class="check-icon" />
          <span
            class="turpost-heading"
            :title="item.turpostName || 'Turpost ' + item.turpostId"
          >
            {{ item.turpostName || 'Turpost ' + item.turpostId }}
          </span>
          <span v-if="item.isPrivate" class="private-badge-pill" title="Privat turpost">
            <Lock :size="10" />
            <span>Privat</span>
          </span>
          <span
            v-else-if="item.visibility === 'private'"
            class="visibility-badge-pill private"
            title="Synlighet: Kun meg"
          >
            <Lock :size="10" />
            <span>Kun meg</span>
          </span>
          <span
            v-else-if="item.visibility === 'friends'"
            class="visibility-badge-pill friends"
            title="Synlighet: Mine venner"
          >
            <Users :size="10" />
            <span>Venner</span>
          </span>
          <span v-else class="visibility-badge-pill all" title="Synlighet: Alle">
            <Globe :size="10" />
            <span>Alle</span>
          </span>
        </div>
        <div class="checkin-header-right">
          <div class="checkin-date-badge">
            <span>{{ formatDate(item.timestamp) }}</span>
          </div>
          <ChevronDown
            :size="16"
            class="chevron-expand"
            :class="{ 'is-open': isExpanded }"
          />
        </div>
      </div>

      <!-- Ekspanderbare detaljer (notat og bilde) -->
      <div v-if="isExpanded" class="checkin-card-details">
        <p v-if="item.description" class="checkin-desc">
          {{ item.description }}
        </p>

        <div v-if="item.imageUrl" class="checkin-photo-wrap">
          <button
            type="button"
            class="photo-thumb-btn"
            @click.stop="emit('view-photo', item.imageUrl!)"
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

        <p v-if="!item.description && !item.imageUrl" class="checkin-empty-detail">
          Ingen notat eller bilde registrert på denne turen.
        </p>

        <!-- Reaksjoner og kommentarer -->
        <CheckinSocialSection
          :checkin="item"
          :current-user-id="currentUserId"
          :is-private="item.isPrivate"
          :spot-id="item.spotId"
          @updated="emit('social-updated', $event)"
        />

        <!-- Handlingsknapper for innsjekkingen -->
        <div class="user-checkin-actions">
          <button
            type="button"
            class="btn-checkin-action"
            @click.stop="emit('view-on-map', item)"
            title="Vis og flytt kartet til denne turposten"
          >
            <MapIcon :size="12" />
            <span>Vis på kart</span>
          </button>
          <button
            type="button"
            class="btn-checkin-action"
            @click.stop="emit('edit', item)"
            title="Rediger eller slett denne innsjekkingen"
          >
            <Pencil :size="12" />
            <span>Edit</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.user-checkin-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px 14px;
  transition:
    transform 0.15s ease,
    background 0.15s ease,
    border-color 0.15s ease;
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
  transition:
    transform 0.2s ease,
    color 0.2s ease;
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
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.visibility-badge-pill {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.visibility-badge-pill.all {
  background: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.visibility-badge-pill.friends {
  background: rgba(16, 185, 129, 0.15);
  color: #6ee7b7;
  border: 1px solid rgba(16, 185, 129, 0.35);
}

.visibility-badge-pill.private {
  background: rgba(245, 158, 11, 0.18);
  color: #fcd34d;
  border: 1px solid rgba(245, 158, 11, 0.35);
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
</style>
