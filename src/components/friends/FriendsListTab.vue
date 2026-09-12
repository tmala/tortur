<script setup lang="ts">
import { Users, UserPlus, User, UserMinus, Loader2 } from 'lucide-vue-next'
import type { FriendUser } from '@/composables/useFriends'

defineProps<{
  friends: FriendUser[]
  actionLoadingId: string | null
}>()

const emit = defineEmits<{
  (e: 'view-profile', friend: FriendUser): void
  (e: 'remove-friend', friend: FriendUser): void
  (e: 'open-search'): void
}>()
</script>

<template>
  <div class="tab-pane">
    <div v-if="friends.length === 0" class="empty-state">
      <div class="empty-icon-wrap">
        <Users :size="32" />
      </div>
      <h4>Ingen venner enda</h4>
      <p>
        Når du blir venner med andre turgåere, kan dere dele innsjekkinger med hverandre.
      </p>
      <button class="btn-primary-action" @click="emit('open-search')">
        <UserPlus :size="16" />
        <span>Finn venner å invitere</span>
      </button>
    </div>

    <div v-else class="friends-list">
      <div v-for="friend in friends" :key="friend.userId" class="friend-card">
        <div
          class="friend-user-info clickable"
          @click="emit('view-profile', friend)"
          title="Klikk for å se profil og innsjekkinger"
        >
          <div class="avatar-wrap">
            <img
              v-if="friend.avatarUrl"
              :src="friend.avatarUrl"
              :alt="friend.userName"
              class="avatar-img"
              referrerpolicy="no-referrer"
            />
            <div v-else class="avatar-fallback">
              <Users :size="18" />
            </div>
          </div>
          <div class="friend-names">
            <span class="friend-name">{{ friend.userName }}</span>
            <span v-if="friend.email" class="friend-email">{{ friend.email }}</span>
          </div>
        </div>

        <div class="friend-actions">
          <button
            class="btn-view-profile"
            @click="emit('view-profile', friend)"
            title="Se profil og innsjekkinger"
          >
            <User :size="13" />
            <span>Profil</span>
          </button>
          <button
            class="btn-remove-friend"
            :disabled="actionLoadingId === friend.userId"
            @click="emit('remove-friend', friend)"
            title="Avslutt vennskap"
          >
            <Loader2 v-if="actionLoadingId === friend.userId" :size="14" class="spin" />
            <UserMinus v-else :size="14" />
            <span>Fjern</span>
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

.btn-primary-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #0284c7, #0369a1);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary-action:hover {
  background: linear-gradient(135deg, #38bdf8, #0284c7);
  transform: translateY(-1px);
}

.friends-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.friend-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  transition: background 0.15s ease;
}

.friend-card:hover {
  background: rgba(255, 255, 255, 0.06);
}

.friend-user-info {
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

.friend-names {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.friend-name {
  font-size: 0.88rem;
  font-weight: 600;
  color: #f3f4f6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.friend-email {
  font-size: 0.72rem;
  color: #9ca3af;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.friend-user-info.clickable {
  cursor: pointer;
}

.friend-user-info.clickable:hover .friend-name {
  color: #38bdf8;
}

.friend-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.btn-view-profile {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 11px;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.25);
  color: #38bdf8;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-view-profile:hover {
  background: rgba(56, 189, 248, 0.22);
  color: #ffffff;
}

.btn-remove-friend {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #f87171;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-remove-friend:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.2);
  color: #fff;
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
