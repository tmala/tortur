<script setup lang="ts">
import { UserCheck, Users, Check, X, Loader2, Send } from 'lucide-vue-next'
import type { FriendRequest } from '@/composables/useFriends'

defineProps<{
  incomingRequests: FriendRequest[]
  outgoingRequests: FriendRequest[]
  actionLoadingId: string | null
}>()

const emit = defineEmits<{
  (e: 'accept', req: FriendRequest): void
  (e: 'reject', fromUserId: string): void
  (e: 'cancel', toUserId: string): void
}>()
</script>

<template>
  <div class="tab-pane">
    <!-- Mottatte forespørsler -->
    <div class="requests-section">
      <div class="requests-section-title">
        <UserCheck :size="16" />
        <span>Mottatte forespørsler ({{ incomingRequests.length }})</span>
      </div>

      <div v-if="incomingRequests.length === 0" class="empty-sub-state">
        <span>Ingen nye venneforespørsler</span>
      </div>

      <div v-else class="requests-list">
        <div
          v-for="req in incomingRequests"
          :key="req.fromUserId"
          class="request-card incoming"
        >
          <div class="req-user-info">
            <div class="avatar-wrap">
              <img
                v-if="req.userAvatar"
                :src="req.userAvatar"
                :alt="req.userName"
                class="avatar-img"
                referrerpolicy="no-referrer"
              />
              <div v-else class="avatar-fallback">
                <Users :size="18" />
              </div>
            </div>
            <div class="req-names">
              <span class="req-name">{{ req.userName }}</span>
              <span class="req-sub">Vil bli vennen din</span>
            </div>
          </div>

          <div class="req-action-buttons">
            <button
              class="btn-accept"
              :disabled="actionLoadingId === req.fromUserId"
              @click="emit('accept', req)"
            >
              <Loader2
                v-if="actionLoadingId === req.fromUserId"
                :size="14"
                class="spin"
              />
              <Check v-else :size="14" />
              <span>Godta</span>
            </button>
            <button
              class="btn-reject"
              :disabled="actionLoadingId === req.fromUserId"
              @click="emit('reject', req.fromUserId)"
            >
              <X :size="14" />
              <span>Avvis</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Sendte forespørsler -->
    <div class="requests-section mt-4">
      <div class="requests-section-title">
        <Send :size="15" />
        <span>Sendte forespørsler ({{ outgoingRequests.length }})</span>
      </div>

      <div v-if="outgoingRequests.length === 0" class="empty-sub-state">
        <span>Ingen ventende sendte forespørsler</span>
      </div>

      <div v-else class="requests-list">
        <div
          v-for="req in outgoingRequests"
          :key="req.toUserId"
          class="request-card outgoing"
        >
          <div class="req-user-info">
            <div class="avatar-wrap">
              <img
                v-if="req.userAvatar"
                :src="req.userAvatar"
                :alt="req.userName"
                class="avatar-img"
                referrerpolicy="no-referrer"
              />
              <div v-else class="avatar-fallback">
                <Users :size="18" />
              </div>
            </div>
            <div class="req-names">
              <span class="req-name">{{ req.userName }}</span>
              <span class="req-sub">Venter på godkjenning...</span>
            </div>
          </div>

          <button
            class="btn-cancel-req"
            :disabled="actionLoadingId === req.toUserId"
            @click="emit('cancel', req.toUserId)"
          >
            <Loader2 v-if="actionLoadingId === req.toUserId" :size="14" class="spin" />
            <X v-else :size="14" />
            <span>Avbryt</span>
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

.requests-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}

.mt-4 {
  margin-top: 16px;
}

.empty-sub-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  font-size: 0.8rem;
  color: #6b7280;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 12px;
}

.requests-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.request-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
}

.request-card.incoming {
  border-color: rgba(16, 185, 129, 0.2);
  background: rgba(16, 185, 129, 0.03);
}

.req-user-info {
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

.req-names {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.req-name {
  font-size: 0.86rem;
  font-weight: 600;
  color: #f3f4f6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.req-sub {
  font-size: 0.72rem;
  color: #9ca3af;
}

.req-action-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-accept {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: #10b981;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-accept:hover:not(:disabled) {
  background: #059669;
}

.btn-reject,
.btn-cancel-req {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.08);
  color: #9ca3af;
  border: none;
  border-radius: 8px;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-reject:hover:not(:disabled),
.btn-cancel-req:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.14);
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
