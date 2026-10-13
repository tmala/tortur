<script setup lang="ts">
import { computed } from 'vue'
import { Calendar, ChevronDown } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    label: string
    count: number
    countUnitSingle?: string
    countUnitPlural?: string
    isExpanded: boolean
    accentColor?: string
  }>(),
  {
    countUnitSingle: 'innsjekking',
    countUnitPlural: 'innsjekkinger',
    accentColor: '#38bdf8',
  },
)

const emit = defineEmits<{
  (e: 'toggle'): void
}>()

const countText = computed(() => {
  const unit = props.count === 1 ? props.countUnitSingle : props.countUnitPlural
  return `${props.count} ${unit}`
})
</script>

<template>
  <button
    type="button"
    class="month-group-header"
    :style="{ '--header-accent': accentColor }"
    :aria-expanded="isExpanded"
    @click="emit('toggle')"
  >
    <div class="month-header-left">
      <Calendar :size="14" class="month-cal-icon" />
      <span class="month-label">{{ label }}</span>
      <span class="month-count-badge">
        <slot name="badge">{{ countText }}</slot>
      </span>
    </div>
    <div class="month-header-right">
      <slot name="right" />
      <ChevronDown
        :size="15"
        class="month-chevron"
        :class="{ rotated: isExpanded }"
      />
    </div>
  </button>
</template>

<style scoped>
.month-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(51, 65, 85, 0.7);
  border-radius: 10px;
  color: #f1f5f9;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  font-family: inherit;
  box-sizing: border-box;
}

.month-group-header:hover {
  background: rgba(30, 41, 59, 0.9);
  border-color: #64748b;
}

.month-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.month-cal-icon {
  color: var(--header-accent, #38bdf8);
  flex-shrink: 0;
}

.month-label {
  font-size: 13px;
  font-weight: 700;
  color: #f8fafc;
}

.month-count-badge {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  background: rgba(51, 65, 85, 0.6);
  padding: 1px 7px;
  border-radius: 10px;
}

.month-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.month-chevron {
  color: #64748b;
  transition: transform 0.2s ease, color 0.15s ease;
  flex-shrink: 0;
}

.month-chevron.rotated {
  transform: rotate(180deg);
  color: var(--header-accent, #38bdf8);
}
</style>
