<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-card glass-panel" role="dialog" aria-modal="true" aria-labelledby="my-spots-title">
        <!-- Header -->
        <div class="modal-header">
          <div class="modal-title-row">
            <div class="modal-icon-badge">⭐</div>
            <div>
              <h2 id="my-spots-title">Mine turposter</h2>
              <p class="modal-subtitle">
                {{ spots.length }} {{ spots.length === 1 ? 'privat turpost lagret' : 'private turposter lagret' }}
              </p>
            </div>
          </div>
          <button class="btn-close" @click="emit('close')" aria-label="Lukk">✕</button>
        </div>

        <!-- Innhold -->
        <div class="modal-body">
          <div v-if="isLoading" class="loading-state">
            <span class="spinner">⏳</span> Henter dine turposter...
          </div>

          <div v-else-if="spots.length === 0" class="empty-state">
            <div class="empty-icon">📍</div>
            <h3>Ingen egne turposter ennå</h3>
            <p>Her kan du samle dine personlige turmål og hemmelige favorittsteder. Private turposter er kun synlige for deg!</p>
            <button class="btn-add-spot-cta" @click="emit('add-spot-click'); emit('close')">
              📍 Legg til turpost i kartet
            </button>
          </div>

          <div v-else class="spots-list">
            <div
              v-for="spot in spots"
              :key="spot.id"
              class="spot-item"
            >
              <div class="spot-item-header">
                <div class="spot-name-row">
                  <span class="spot-icon">⭐</span>
                  <h3 class="spot-name">{{ spot.name }}</h3>
                  <span v-if="spot.alt" class="spot-alt">{{ spot.alt }} moh.</span>
                </div>
                <div class="spot-status-badge" :class="spot.status || 'private'">
                  {{ spot.suggestedForPublic ? '📨 Foreslått for admin' : '🔒 Privat' }}
                </div>
              </div>

              <div class="spot-details">
                <span class="spot-geo">📍 {{ spot.kommune }}, {{ spot.fylke }}</span>
                <span class="spot-coords">{{ spot.lat.toFixed(5) }}°, {{ spot.lng.toFixed(5) }}°</span>
              </div>

              <div class="spot-actions">
                <button
                  v-if="!spot.suggestedForPublic"
                  class="btn-suggest-spot"
                  @click="emit('suggest-public', spot)"
                  title="Foreslå denne turposten til administrator slik at den kan legges inn i mountains.csv for alle"
                >
                  📨 Foreslå som offentlig
                </button>
                <button
                  class="btn-checkins-spot"
                  @click="emit('view-checkins', spot); emit('close')"
                  title="Se dine private innsjekkinger på dette punktet"
                >
                  👁️ Innsjekkinger
                </button>
                <button
                  class="btn-view-map"
                  @click="emit('view-spot', spot); emit('close')"
                  title="Sentrer kartet på denne turposten"
                >
                  🗺️ Kart
                </button>
                <button
                  class="btn-delete-spot"
                  @click="handleDelete(spot.id)"
                  title="Slett denne turposten"
                >
                  🗑️ Slett
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <button
            class="btn-add-new"
            @click="emit('add-spot-click'); emit('close')"
            title="Klikk for å aktivere kart-klikk"
          >
            📍 Legg til ny turpost
          </button>
          <button class="btn-primary" @click="emit('close')">Lukk</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { TurpostItem } from '@/composables/useTurposter'

const props = defineProps<{
  isOpen: boolean
  spots: TurpostItem[]
  isLoading?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
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

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 16px;
}

.modal-card {
  background: rgba(30, 41, 59, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  width: 100%;
  max-width: 600px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
  color: #f8fafc;
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.modal-icon-badge {
  font-size: 24px;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(168, 85, 247, 0.15);
  border: 1px solid rgba(168, 85, 247, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #f8fafc;
}

.modal-subtitle {
  margin: 2px 0 0;
  font-size: 0.85rem;
  color: #94a3b8;
}

.btn-close {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 8px;
  transition: background 0.2s;
}
.btn-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #94a3b8;
}

.empty-icon {
  font-size: 44px;
  margin-bottom: 12px;
}

.empty-state h3 {
  margin: 0 0 6px;
  color: #f1f5f9;
  font-size: 1.15rem;
}

.empty-state p {
  margin: 0 auto 20px;
  max-width: 420px;
  font-size: 0.9rem;
  line-height: 1.5;
}

.btn-add-spot-cta {
  background: linear-gradient(135deg, #a855f7, #7c3aed);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-weight: 600;
  padding: 10px 20px;
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
  gap: 12px;
}

.spot-item {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  gap: 8px;
}

.spot-icon {
  font-size: 16px;
}

.spot-name {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: #c084fc;
}

.spot-alt {
  font-size: 0.8rem;
  background: rgba(192, 132, 252, 0.15);
  border: 1px solid rgba(192, 132, 252, 0.3);
  color: #e9d5ff;
  padding: 2px 8px;
  border-radius: 6px;
}

.spot-status-badge {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 12px;
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

.spot-details {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  color: #94a3b8;
}

.spot-coords {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.78rem;
}

.spot-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.btn-suggest-spot {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.35);
  color: #fde68a;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
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
  padding: 6px 12px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
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
  padding: 6px 12px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-view-map:hover {
  background: rgba(168, 85, 247, 0.25);
}

.btn-delete-spot {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-delete-spot:hover {
  background: rgba(239, 68, 68, 0.25);
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.btn-add-new {
  background: linear-gradient(135deg, #a855f7, #7c3aed);
  border: none;
  border-radius: 10px;
  color: #ffffff;
  padding: 8px 16px;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
  box-shadow: 0 3px 8px rgba(168, 85, 247, 0.3);
  transition: transform 0.15s;
}
.btn-add-new:hover {
  transform: translateY(-1px);
}

.btn-primary {
  background: #334155;
  border: 1px solid #475569;
  border-radius: 10px;
  color: #ffffff;
  padding: 8px 18px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-primary:hover {
  background: #475569;
}

.spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
