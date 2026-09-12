<script setup lang="ts">
import { Globe, Users, Lock } from 'lucide-vue-next'
import type { CheckinVisibility } from '@/composables/useFriends'

withDefaults(
  defineProps<{
    modelValue: CheckinVisibility
    label?: string
    disabled?: boolean
  }>(),
  {
    label: 'Hvem kan se innsjekkingen?',
    disabled: false,
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', val: CheckinVisibility): void
}>()
</script>

<template>
  <div class="form-group checkin-visibility-section">
    <label class="form-label vis-label">{{ label }}</label>
    <div class="checkin-vis-selector">
      <button
        type="button"
        class="vis-pill-btn"
        :class="{ active: modelValue === 'all' }"
        :disabled="disabled"
        @click="emit('update:modelValue', 'all')"
        title="Synlig for alle turgåere"
      >
        <Globe :size="13" />
        <span>Alle</span>
      </button>
      <button
        type="button"
        class="vis-pill-btn"
        :class="{ active: modelValue === 'friends' }"
        :disabled="disabled"
        @click="emit('update:modelValue', 'friends')"
        title="Kun synlig for deg og dine venner"
      >
        <Users :size="13" />
        <span>Mine venner</span>
      </button>
      <button
        type="button"
        class="vis-pill-btn"
        :class="{ active: modelValue === 'private' }"
        :disabled="disabled"
        @click="emit('update:modelValue', 'private')"
        title="Kun synlig for deg"
      >
        <Lock :size="13" />
        <span>Kun meg</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkin-visibility-section {
  margin-top: 2px;
}

.vis-label {
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
}

.checkin-vis-selector {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.vis-pill-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.vis-pill-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
}

.vis-pill-btn.active {
  background: rgba(16, 185, 129, 0.18);
  border-color: #10b981;
  color: #34d399;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.2);
}

.vis-pill-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
