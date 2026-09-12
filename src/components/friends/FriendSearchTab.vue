<script setup lang="ts">
import {
  Search,
  X,
  Loader2,
  Users,
  Check,
  Clock,
  UserCheck,
  UserPlus
} from 'lucide-vue-next'
import type { PublicUser } from '@/composables/useFriends'

defineProps<{
  searchQuery: string
  searchResults: PublicUser[]
  isSearching: boolean
  actionLoadingId: string | null
  outgoingTargetIds: Set<string>
  incomingSenderIds: Set<string>
  isFriend: (userId: string) => boolean
}>()

const emit = defineEmits<{
  (e: 'update:searchQuery', val: string): void
  (e: 'clear-search'): void
  (e: 'send-request', user: PublicUser): void
  (e: 'go-to-requests'): void
}>()
</script>

<template>
  <div class="tab-pane">
    <!-- Søkefelt -->
    <div class="search-input-wrap">
      <Search :size="16" class="search-icon" />
      <input
        :value="searchQuery"
        @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
        type="text"
        class="search-input"
        placeholder="Søk etter turgåere på navn eller e-post..."
      />
      <button
        v-if="searchQuery"
        class="search-clear-btn"
        @click="emit('clear-search')"
      >
        <X :size="14" />
      </button>
    </div>

    <!-- Søkeresultater -->
    <div v-if="isSearching" class="loading-state">
      <Loader2 :size="22" class="spin" />
      <span>Søker etter brukere...</span>
    </div>

    <div v-else-if="searchResults.length === 0" class="empty-state">
      <div class="empty-icon-wrap">
        <Search :size="28" />
      </div>
      <h4>Ingen brukere funnet</h4>
      <p>
        Prøv et annet søkeord. Brukere må ha logget inn i TorTur minst én gang for å vises
        her.
      </p>
    </div>

    <div v-else class="search-results-list">
      <div v-for="user in searchResults" :key="user.userId" class="search-user-card">
        <div class="search-user-info">
          <div class="avatar-wrap">
            <img
              v-if="user.avatarUrl"
              :src="user.avatarUrl"
              :alt="user.userName"
              class="avatar-img"
              referrerpolicy="no-referrer"
            />
            <div v-else class="avatar-fallback">
              <Users :size="18" />
            </div>
          </div>
          <div class="search-user-names">
            <span class="user-display-name">{{ user.userName }}</span>
            <span v-if="user.email" class="user-email-text">{{ user.email }}</span>
          </div>
        </div>

        <!-- Status / Handling for hver bruker -->
        <div class="user-status-action">
          <!-- Allerede venner -->
          <span v-if="isFriend(user.userId)" class="badge-status friend">
            <Check :size="13" />
            <span>Venner</span>
          </span>

          <!-- Forespørsel allerede sendt -->
          <span
            v-else-if="outgoingTargetIds.has(user.userId)"
            class="badge-status pending"
          >
            <Clock :size="13" />
            <span>Sendt</span>
          </span>

          <!-- Har sendt deg en forespørsel -->
          <button
            v-else-if="incomingSenderIds.has(user.userId)"
            class="btn-quick-accept"
            @click="emit('go-to-requests')"
          >
            <UserCheck :size="13" />
            <span>Svar</span>
          </button>

          <!-- Kan invitere -->
          <button
            v-else
            class="btn-invite-user"
            :disabled="actionLoadingId === user.userId"
            @click="emit('send-request', user)"
          >
            <Loader2 v-if="actionLoadingId === user.userId" :size="13" class="spin" />
            <UserPlus v-else :size="13" />
            <span>Legg til</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tab-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: #6b7280;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 10px 36px 10px 36px;
  background: rgba(15, 20, 30, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  color: #f3f4f6;
  font-size: 0.85rem;
  outline: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.search-input:focus {
  border-color: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
}

.search-clear-btn {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  padding: 4px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
  color: #9ca3af;
}

.empty-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  margin-bottom: 12px;
}

.empty-state h4 {
  font-size: 0.95rem;
  font-weight: 600;
  color: #f3f4f6;
  margin: 0 0 6px 0;
}

.empty-state p {
  font-size: 0.8rem;
  color: #9ca3af;
  margin: 0 0 16px 0;
  max-width: 280px;
  line-height: 1.4;
}

.search-results-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-user-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
}

.search-user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.avatar-wrap {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #9ca3af;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.search-user-names {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-display-name {
  font-size: 0.86rem;
  font-weight: 600;
  color: #f3f4f6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-email-text {
  font-size: 0.72rem;
  color: #9ca3af;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-status-action {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.badge-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 600;
}

.badge-status.friend {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.badge-status.pending {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

.btn-invite-user {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.btn-invite-user:hover:not(:disabled) {
  transform: translateY(-1px);
}

.btn-quick-accept {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  background: #10b981;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
