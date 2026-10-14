<script setup lang="ts">
import { Globe, Users, Lock } from 'lucide-vue-next'
import type { TrackVisibility } from '@/stores/gpsTrack'

withDefaults(
  defineProps<{
    label?: string
    disabled?: boolean
  }>(),
  {
    label: 'Hvem kan se sporet?',
    disabled: false,
  },
)

const model = defineModel<TrackVisibility>({ default: 'private' })
</script>

<template>
  <div class="track-visibility-section">
    <label class="vis-label">{{ label }}</label>
    <div class="vis-selector-grid">
      <button
        type="button"
        class="vis-pill-btn"
        :class="{ active: model === 'all' }"
        :disabled="disabled"
        @click="model = 'all'"
        title="Synlig for alle turgåere"
        aria-label="Sett synlighet til Alle"
      >
        <Globe :size="13" />
        <span>Alle</span>
      </button>

      <button
        type="button"
        class="vis-pill-btn"
        :class="{ active: model === 'friends' }"
        :disabled="disabled"
        @click="model = 'friends'"
        title="Kun synlig for deg og dine venner"
        aria-label="Sett synlighet til Venner"
      >
        <Users :size="13" />
        <span>Venner</span>
      </button>

      <button
        type="button"
        class="vis-pill-btn"
        :class="{ active: model === 'private' }"
        :disabled="disabled"
        @click="model = 'private'"
        title="Kun synlig for deg selv"
        aria-label="Sett synlighet til Privat"
      >
        <Lock :size="13" />
        <span>Privat</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.track-visibility-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.vis-label {
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
}

.vis-selector-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.vis-pill-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 9px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  font-family: inherit;
}

.vis-pill-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
}

.vis-pill-btn.active {
  background: rgba(249, 115, 22, 0.18);
  border-color: #f97316;
  color: #fb923c;
  box-shadow: 0 0 10px rgba(249, 115, 22, 0.25);
}

.vis-pill-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
