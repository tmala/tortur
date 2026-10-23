<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    size?: number | string
    label?: string
    color?: string
    inline?: boolean
  }>(),
  {
    size: 24,
    label: '',
    color: '#38bdf8',
    inline: false,
  },
)

const sizePx = computed(() => {
  return typeof props.size === 'number' ? `${props.size}px` : props.size
})
</script>

<template>
  <div
    class="loading-spinner-container"
    :class="{ inline: props.inline }"
    role="status"
    aria-live="polite"
  >
    <div
      class="spinner"
      :style="{
        width: sizePx,
        height: sizePx,
        borderTopColor: props.color,
      }"
    />
    <span v-if="props.label" class="spinner-label">{{ props.label }}</span>
    <span v-else class="sr-only">Laster...</span>
  </div>
</template>

<style scoped>
.loading-spinner-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  gap: 12px;
  color: var(--text-secondary, #94a3b8);
  font-size: 13px;
}

.loading-spinner-container.inline {
  display: inline-flex;
  flex-direction: row;
  padding: 0;
  gap: 8px;
}

.spinner {
  border: 2px solid rgba(255, 255, 255, 0.12);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

.spinner-label {
  color: var(--text-secondary, #94a3b8);
  font-size: 13px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 2s;
  }
}
</style>
