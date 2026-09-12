<script setup lang="ts">
import { Globe, Users, Lock, Check } from 'lucide-vue-next'
import type { CheckinVisibility } from '@/composables/useFriends'

defineProps<{
  defaultVisibility: CheckinVisibility
}>()

const emit = defineEmits<{
  (e: 'set-visibility', val: CheckinVisibility): void
}>()
</script>

<template>
  <div class="tab-pane">
    <div class="settings-card">
      <h4>Standard synlighet for nye innsjekkinger</h4>
      <p class="settings-desc">
        Velg hvem som som standard skal kunne se dine nye innsjekkinger og turbilder. Du
        kan også justere dette for hver enkelt innsjekking når du sjekker inn.
      </p>

      <div class="visibility-options-grid">
        <!-- Valg 1: Alle -->
        <button
          class="visibility-option-btn"
          :class="{ active: defaultVisibility === 'all' }"
          @click="emit('set-visibility', 'all')"
        >
          <div class="opt-icon-circle all">
            <Globe :size="20" />
          </div>
          <div class="opt-content">
            <div class="opt-title-row">
              <span class="opt-title">Alle</span>
              <Check v-if="defaultVisibility === 'all'" :size="16" class="check-active" />
            </div>
            <span class="opt-desc">Innsjekkingen vises for alle turgåere i appen.</span>
          </div>
        </button>

        <!-- Valg 2: Mine venner -->
        <button
          class="visibility-option-btn"
          :class="{ active: defaultVisibility === 'friends' }"
          @click="emit('set-visibility', 'friends')"
        >
          <div class="opt-icon-circle friends">
            <Users :size="20" />
          </div>
          <div class="opt-content">
            <div class="opt-title-row">
              <span class="opt-title">Mine venner</span>
              <Check
                v-if="defaultVisibility === 'friends'"
                :size="16"
                class="check-active"
              />
            </div>
            <span class="opt-desc">Kun synlig for deg og de du er venner med.</span>
          </div>
        </button>

        <!-- Valg 3: Kun meg -->
        <button
          class="visibility-option-btn"
          :class="{ active: defaultVisibility === 'private' }"
          @click="emit('set-visibility', 'private')"
        >
          <div class="opt-icon-circle private">
            <Lock :size="20" />
          </div>
          <div class="opt-content">
            <div class="opt-title-row">
              <span class="opt-title">Kun meg</span>
              <Check
                v-if="defaultVisibility === 'private'"
                :size="16"
                class="check-active"
              />
            </div>
            <span class="opt-desc">Helt privat. Synlig kun for deg i din egen profil.</span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tab-pane {
  display: flex;
  flex-direction: column;
}

/* Synlighetsinnstillinger */
.settings-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0;
}

.settings-card h4 {
  margin: 0;
  font-size: 0.92rem;
  color: #f3f4f6;
  font-weight: 700;
}

.settings-desc {
  margin: 0 0 6px 0;
  font-size: 0.78rem;
  line-height: 1.45;
  color: #9ca3af;
}

.visibility-options-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.visibility-option-btn {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.visibility-option-btn:hover {
  background: rgba(255, 255, 255, 0.06);
}

.visibility-option-btn.active {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.4);
}

.opt-icon-circle {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.opt-icon-circle.all {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.opt-icon-circle.friends {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.opt-icon-circle.private {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

.opt-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.opt-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.opt-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: #f3f4f6;
}

.check-active {
  color: #34d399;
}

.opt-desc {
  font-size: 0.74rem;
  color: #9ca3af;
  line-height: 1.35;
}
</style>
