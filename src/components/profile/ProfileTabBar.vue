<script setup lang="ts">
import { Trophy, Route, Star, Users } from 'lucide-vue-next'
import type { ProfileTab } from '@/types/profile'

const activeTab = defineModel<ProfileTab>({ default: 'checkins' })

defineProps<{
  checkinsCount?: number
  savedTracksCount?: number
  mySpotsCount?: number
  friendsCount?: number
  pendingFriendRequestsCount?: number
}>()

function selectTab(tab: ProfileTab) {
  activeTab.value = tab
}
</script>

<template>
  <nav class="profile-tab-bar" role="tablist" aria-label="Profilmenyer">
    <!-- Fane 1: Innsjekkinger -->
    <button
      type="button"
      role="tab"
      :aria-selected="activeTab === 'checkins'"
      class="profile-tab-btn"
      :class="{ active: activeTab === 'checkins' }"
      @click="selectTab('checkins')"
      title="Mine innsjekkinger"
      aria-label="Mine innsjekkinger"
    >
      <Trophy :size="16" class="tab-icon checkins-icon" />
      <span class="tab-label">Innsjekkinger</span>
      <span v-if="checkinsCount !== undefined" class="tab-badge checkins-badge">
        {{ checkinsCount }}
      </span>
    </button>

    <!-- Fane 2: Spor -->
    <button
      type="button"
      role="tab"
      :aria-selected="activeTab === 'tracks'"
      class="profile-tab-btn profile-tracks-card"
      :class="{ active: activeTab === 'tracks' }"
      @click="selectTab('tracks')"
      title="Mine GPS-spor"
      aria-label="Mine GPS-spor"
    >
      <Route :size="16" class="tab-icon tracks-icon" />
      <span class="tab-label">Spor</span>
      <span v-if="savedTracksCount !== undefined" class="tab-badge tracks-badge">
        {{ savedTracksCount }}
      </span>
    </button>

    <!-- Fane 3: Private Turposter -->
    <button
      type="button"
      role="tab"
      :aria-selected="activeTab === 'spots'"
      class="profile-tab-btn profile-spots-card"
      :class="{ active: activeTab === 'spots' }"
      @click="selectTab('spots')"
      title="Private turposter"
      aria-label="Private turposter"
    >
      <Star :size="16" class="tab-icon spots-icon" />
      <span class="tab-label">Private Turposter</span>
      <span v-if="mySpotsCount !== undefined" class="tab-badge spots-badge">
        {{ mySpotsCount }}
      </span>
    </button>

    <!-- Fane 4: Venner og Synlighet -->
    <button
      type="button"
      role="tab"
      :aria-selected="activeTab === 'friends'"
      class="profile-tab-btn profile-friends-card"
      :class="{ active: activeTab === 'friends' }"
      @click="selectTab('friends')"
      title="Venner og synlighet"
      aria-label="Venner og synlighet"
    >
      <div class="icon-wrap-relative">
        <Users :size="16" class="tab-icon friends-icon" />
        <span
          v-if="pendingFriendRequestsCount && pendingFriendRequestsCount > 0"
          class="tab-pending-dot"
          :title="`${pendingFriendRequestsCount} nye venneforespørsler`"
        >
          {{ pendingFriendRequestsCount }}
        </span>
      </div>
      <span class="tab-label">Venner og Synlighet</span>
      <span v-if="friendsCount !== undefined" class="tab-badge friends-badge">
        {{ friendsCount }}
      </span>
    </button>
  </nav>
</template>

<style scoped>
.profile-tab-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.75);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.profile-tab-bar::-webkit-scrollbar {
  display: none;
}

.profile-tab-btn {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  user-select: none;
}

.profile-tab-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
  border-color: rgba(255, 255, 255, 0.16);
}

.profile-tab-btn.active {
  background: rgba(56, 189, 248, 0.12);
  border-color: rgba(56, 189, 248, 0.35);
  color: #38bdf8;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.icon-wrap-relative {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tab-icon {
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.profile-tab-btn:hover .tab-icon {
  transform: scale(1.08);
}

.checkins-icon {
  color: #fbbf24;
}

.tracks-icon {
  color: #fb923c;
}

.spots-icon {
  color: #c084fc;
}

.friends-icon {
  color: #4ade80;
}

.tab-label {
  font-size: 12.5px;
  letter-spacing: -0.01em;
}

.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 19px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  background: rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
}

.profile-tab-btn.active .tab-badge {
  background: rgba(56, 189, 248, 0.25);
  color: #38bdf8;
}

.tab-pending-dot {
  position: absolute;
  top: -6px;
  right: -7px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 9999px;
  background: #ef4444;
  color: #ffffff;
  font-size: 9px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 1.5px #0f172a;
}

/* Responsiv regel: Når skjermen/panelet er for smalt for full tekst,
   skjules teksten slik at kun ikonet og telleren vises */
@container (max-width: 630px) {
  .tab-label {
    display: none;
  }
}

@media (max-width: 630px) {
  .tab-label {
    display: none;
  }

  .profile-tab-btn {
    padding: 6px 8px;
    gap: 4px;
  }
}
</style>
