<script setup lang="ts">
import { Route, Star, Users, ClipboardList } from 'lucide-vue-next'

defineProps<{
  isAdmin?: boolean
  savedTracksCount?: number
  mySpotsCount?: number
  friendsCount?: number
  pendingFriendRequestsCount?: number
  spotSuggestionsCount?: number
}>()

const emit = defineEmits<{
  (e: 'open-saved-tracks'): void
  (e: 'open-my-spots'): void
  (e: 'open-friends'): void
  (e: 'open-spot-suggestions'): void
}>()
</script>

<template>
  <!-- Snarveier side om side: Mine spor, Private turposter, Venner og (for admin) Forslag -->
  <div
    class="profile-shortcuts-grid"
    :class="{ 'has-4-cols': isAdmin && (spotSuggestionsCount || 0) > 0 }"
  >
    <!-- Snarvei til Mine spor -->
    <button
      class="profile-shortcut-card profile-tracks-card"
      @click="emit('open-saved-tracks')"
      title="Se og administrer dine lagrede GPS-spor"
    >
      <div class="shortcut-icon-wrap tracks-icon">
        <Route :size="17" />
      </div>
      <div class="shortcut-texts">
        <span class="shortcut-title">Mine spor</span>
        <span class="shortcut-sub">
          {{ savedTracksCount || 0 }} spor
        </span>
      </div>
    </button>

    <!-- Snarvei til Private turposter -->
    <button
      class="profile-shortcut-card profile-spots-card"
      @click="emit('open-my-spots')"
      title="Se og administrer dine private turposter"
    >
      <div class="shortcut-icon-wrap spots-icon">
        <Star :size="17" />
      </div>
      <div class="shortcut-texts">
        <span class="shortcut-title">Private turposter</span>
        <span class="shortcut-sub">
          {{ mySpotsCount || 0 }} {{ (mySpotsCount || 0) === 1 ? 'turpost' : 'turposter' }}
        </span>
      </div>
    </button>

    <!-- Snarvei til Venner -->
    <button
      class="profile-shortcut-card profile-friends-card"
      @click="emit('open-friends')"
      title="Se dine venner og administrer synlighet"
    >
      <div class="shortcut-icon-wrap friends-icon">
        <Users :size="17" />
        <span v-if="pendingFriendRequestsCount" class="friends-pending-dot">
          {{ pendingFriendRequestsCount }}
        </span>
      </div>
      <div class="shortcut-texts">
        <span class="shortcut-title">Venner</span>
        <span class="shortcut-sub">
          {{ friendsCount || 0 }} {{ (friendsCount || 0) === 1 ? 'venn' : 'venner' }}
        </span>
      </div>
    </button>

    <!-- Snarvei til Forslag turposter (kun admin og kun ved nye forslag) -->
    <button
      v-if="isAdmin && (spotSuggestionsCount || 0) > 0"
      class="profile-shortcut-card profile-suggestions-card"
      @click="emit('open-spot-suggestions')"
      title="Se innkommende forslag til turposter"
    >
      <div class="shortcut-icon-wrap suggestions-icon">
        <ClipboardList :size="17" />
        <span class="suggestions-pending-dot">
          {{ spotSuggestionsCount }}
        </span>
      </div>
      <div class="shortcut-texts">
        <span class="shortcut-title">Forslag</span>
        <span class="shortcut-sub">
          {{ spotSuggestionsCount }} {{ spotSuggestionsCount === 1 ? 'nytt' : 'nye' }}
        </span>
      </div>
    </button>
  </div>
</template>

<style scoped>
.profile-shortcuts-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin: 12px 16px 0 16px;
}

.profile-shortcuts-grid.has-4-cols {
  grid-template-columns: repeat(4, 1fr);
}

@media (max-width: 480px) {
  .profile-shortcuts-grid.has-4-cols {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 360px) {
  .profile-shortcuts-grid:not(.has-4-cols) {
    grid-template-columns: 1fr;
  }
}

.profile-shortcut-card {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 8px;
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

.profile-friends-card {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(15, 23, 42, 0.8));
  border-color: rgba(16, 185, 129, 0.35);
}

.profile-friends-card:hover {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.22), rgba(15, 23, 42, 0.9));
  border-color: #10b981;
  transform: translateY(-1px);
}

.shortcut-icon-wrap {
  position: relative;
  width: 30px;
  height: 30px;
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

.shortcut-icon-wrap.friends-icon {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.friends-pending-dot {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #f97316;
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  border-radius: 8px;
  min-width: 15px;
  height: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  box-shadow: 0 0 0 2px #0f172a;
  animation: pulse 1.8s infinite ease-in-out;
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

.profile-suggestions-card {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(15, 23, 42, 0.8));
  border-color: rgba(245, 158, 11, 0.35);
}

.profile-suggestions-card:hover {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(15, 23, 42, 0.9));
  border-color: #f59e0b;
  transform: translateY(-1px);
}

.suggestions-pending-dot {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #f59e0b;
  color: #0f172a;
  font-size: 9px;
  font-weight: 800;
  border-radius: 8px;
  min-width: 15px;
  height: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  box-shadow: 0 0 0 2px #0f172a;
  animation: pulse 1.8s infinite ease-in-out;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.15);
  }
}
</style>
