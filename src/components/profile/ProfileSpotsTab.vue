<script setup lang="ts">
import { Star, PlusCircle } from 'lucide-vue-next'
import type { TurpostItem } from '@/composables/useTurposter'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'

const props = withDefaults(
  defineProps<{
    spots: TurpostItem[]
    isLoading?: boolean
  }>(),
  {
    isLoading: false,
  },
)

const emit = defineEmits<{
  (e: 'view-spot', spot: TurpostItem): void
  (e: 'delete-spot', spotId: string): void
  (e: 'add-spot-click'): void
  (e: 'suggest-public', spot: TurpostItem): void
  (e: 'view-checkins', spot: TurpostItem): void
}>()

function handleDelete(spotId: string | number) {
  if (confirm('Er du sikker på at du vil slette denne private turposten?')) {
    emit('delete-spot', String(spotId))
  }
}
</script>

<template>
  <div class="profile-spots-tab">
    <!-- Toppstripe med tittel, antall og Legg til-knapp -->
    <div class="spots-header-stripe">
      <div class="stripe-texts">
        <span class="stripe-title">Private turposter</span>
        <span class="stripe-count">
          {{ props.spots.length }} {{ props.spots.length === 1 ? 'lagret' : 'lagret' }}
        </span>
      </div>

      <button
        type="button"
        class="btn-add-spot-top"
        @click="emit('add-spot-click')"
        title="Klikk for å aktivere kart-klikk og legge til en ny privat turpost"
        aria-label="Legg til ny turpost i kartet"
      >
        <PlusCircle :size="15" />
        <span>Legg til turpost</span>
      </button>
    </div>

    <!-- Scroll-område for turposter -->
    <div class="spots-scroll-area">
      <LoadingSpinner
        v-if="isLoading"
        label="Henter dine private turposter..."
        color="#c084fc"
      />

      <div v-else-if="props.spots.length === 0" class="empty-state">
        <div class="empty-icon-wrap">
          <Star :size="32" />
        </div>
        <h4>Ingen egne turposter ennå</h4>
        <p>
          Her kan du samle dine personlige turmål og hemmelige favorittsteder. Private turposter er
          kun synlige for deg!
        </p>
        <button
          type="button"
          class="btn-add-spot-cta"
          @click="emit('add-spot-click')"
          aria-label="Legg til turpost i kartet"
        >
          📍 Legg til turpost i kartet
        </button>
      </div>

      <div v-else class="spots-list">
        <div
          v-for="spot in props.spots"
          :key="spot.id"
          class="spot-item"
        >
          <div class="spot-item-header">
            <div class="spot-name-row">
              <span class="spot-icon">⭐</span>
              <h4 class="spot-name">{{ spot.name }}</h4>
              <span v-if="spot.alt" class="spot-alt">{{ spot.alt }} moh.</span>
            </div>
            <div class="spot-status-badge" :class="spot.status || 'private'">
              {{
                spot.status === 'approved'
                  ? '✅ Godkjent av admin'
                  : spot.status === 'denied'
                    ? '🚫 Avvist av admin'
                    : spot.suggestedForPublic
                      ? '📨 Foreslått for admin'
                      : '🔒 Privat'
              }}
            </div>
          </div>

          <div class="spot-details">
            <span class="spot-geo">📍 {{ spot.kommune }}, {{ spot.fylke }}</span>
            <span class="spot-coords">{{ spot.lat.toFixed(5) }}°, {{ spot.lng.toFixed(5) }}°</span>
          </div>

          <div class="spot-actions">
            <button
              v-if="!spot.suggestedForPublic && spot.status !== 'denied' && spot.status !== 'approved'"
              type="button"
              class="btn-suggest-spot"
              @click="emit('suggest-public', spot)"
              title="Foreslå denne turposten til administrator slik at den kan legges inn for alle"
              aria-label="Foreslå som offentlig"
            >
              📨 Foreslå som offentlig
            </button>
            <button
              type="button"
              class="btn-checkins-spot"
              @click="emit('view-checkins', spot)"
              title="Se dine private innsjekkinger på dette punktet"
              aria-label="Innsjekkinger"
            >
              👁️ Innsjekkinger
            </button>
            <button
              type="button"
              class="btn-view-map"
              @click="emit('view-spot', spot)"
              title="Sentrer kartet på denne turposten"
              aria-label="Se i kart"
            >
              🗺️ Kart
            </button>
            <button
              type="button"
              class="btn-delete-spot"
              @click="handleDelete(spot.id)"
              title="Slett denne turposten"
              aria-label="Slett turpost"
            >
              🗑️ Slett
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-spots-tab {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.spots-header-stripe {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 8px;
  background: rgba(15, 23, 42, 0.4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.stripe-texts {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.stripe-title {
  color: #f1f5f9;
  font-size: 13px;
  font-weight: 600;
}

.stripe-count {
  color: #94a3b8;
  font-size: 11px;
}

.btn-add-spot-top {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%);
  border: 1px solid rgba(168, 85, 247, 0.4);
  border-radius: 8px;
  color: #ffffff;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(168, 85, 247, 0.3);
  transition: all 0.15s ease;
}

.btn-add-spot-top:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(168, 85, 247, 0.45);
}

.spots-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px calc(24px + env(safe-area-inset-bottom, 0px));
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
  background: rgba(168, 85, 247, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c084fc;
  margin-bottom: 12px;
}

.empty-state h4 {
  margin: 0 0 6px;
  font-size: 15px;
  color: #e2e8f0;
}

.empty-state p {
  margin: 0 auto 16px;
  font-size: 12px;
  max-width: 320px;
  line-height: 1.5;
}

.btn-add-spot-cta {
  background: linear-gradient(135deg, #a855f7, #7c3aed);
  border: none;
  border-radius: 10px;
  color: #fff;
  font-weight: 600;
  font-size: 13px;
  padding: 9px 18px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(168, 85, 247, 0.3);
  transition: transform 0.15s;
}

.btn-add-spot-cta:hover {
  transform: translateY(-1px);
}

.spots-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.spot-item {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.15s ease;
}

.spot-item:hover {
  border-color: rgba(168, 85, 247, 0.25);
  background: rgba(15, 23, 42, 0.75);
}

.spot-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.spot-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.spot-icon {
  font-size: 15px;
}

.spot-name {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #e2e8f0;
}

.spot-alt {
  font-size: 11px;
  background: rgba(192, 132, 252, 0.15);
  border: 1px solid rgba(192, 132, 252, 0.3);
  color: #e9d5ff;
  padding: 1px 6px;
  border-radius: 5px;
}

.spot-status-badge {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 10px;
  font-weight: 500;
}

.spot-status-badge.private {
  background: rgba(100, 116, 139, 0.2);
  color: #94a3b8;
  border: 1px solid rgba(100, 116, 139, 0.3);
}

.spot-status-badge.pending {
  background: rgba(245, 158, 11, 0.15);
  color: #fde68a;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.spot-status-badge.approved {
  background: rgba(16, 185, 129, 0.15);
  color: #6ee7b7;
  border: 1px solid rgba(16, 185, 129, 0.35);
}

.spot-status-badge.denied {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.35);
}

.spot-details {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #94a3b8;
}

.spot-coords {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
}

.spot-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 2px;
  flex-wrap: wrap;
}

.btn-suggest-spot {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.35);
  color: #fde68a;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-suggest-spot:hover {
  background: rgba(245, 158, 11, 0.25);
  border-color: #f59e0b;
  color: #ffffff;
}

.btn-checkins-spot {
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #7dd3fc;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-checkins-spot:hover {
  background: rgba(56, 189, 248, 0.25);
  color: #ffffff;
}

.btn-view-map {
  background: rgba(168, 85, 247, 0.15);
  border: 1px solid rgba(168, 85, 247, 0.3);
  color: #c084fc;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-view-map:hover {
  background: rgba(168, 85, 247, 0.25);
}

.btn-delete-spot {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-delete-spot:hover {
  background: rgba(239, 68, 68, 0.25);
}

@media (max-width: 480px) {
  .spots-header-stripe {
    padding: 8px 12px;
  }

  .spots-scroll-area {
    padding: 8px 12px calc(20px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
