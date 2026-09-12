<script setup lang="ts">
defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <transition name="fade-slide">
    <div v-if="isOpen" class="info-modal glass-panel">
      <div class="layer-modal-header">
        <h3>Om TorTur</h3>
        <button class="btn-close" @click="emit('close')" title="Lukk">✕</button>
      </div>
      <div class="info-content">
        <p>
          TorTur er en <strong>Progressive Web App (PWA)</strong> med åpne kartdata fra
          <strong>OpenStreetMap</strong> og <strong>Kartverket</strong>.
        </p>
        <div class="info-feature-list">
          <div class="info-feature-item">
            <span class="bullet">📍</span>
            <span><strong>Finn min posisjon:</strong> Viser hvor du er og sentrerer kartet.</span>
          </div>
          <div class="info-feature-item">
            <span class="bullet">🧭</span>
            <span><strong>Følg meg:</strong> Sporer bevegelsene dine fortløpende.</span>
          </div>
          <div class="info-feature-item">
            <span class="bullet">🗺️</span>
            <span
              ><strong>Klikk i kartet:</strong> Slå på kommunegrenser og klikk direkte på en kommune
              i kartet for å hente turpostene der.</span
            >
          </div>
          <div class="info-feature-item">
            <span class="bullet">⛰️</span>
            <span
              ><strong>Turposter i Norge:</strong> Utforsk over 15 000 turposter sortert etter fylke
              og kommune.</span
            >
          </div>
          <div class="info-feature-item">
            <span class="bullet">⛵</span>
            <span
              ><strong>Sjøkart:</strong> Offisielt norsk sjøkart fra Kartverket (med dybder og
              fyrlykter) og globalt OpenSeaMap.</span
            >
          </div>
          <div class="info-feature-item">
            <span class="bullet">⚡</span>
            <span
              ><strong>PWA Offline Cache:</strong> Kan installeres på mobilen eller
              skrivebordet.</span
            >
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.glass-panel {
  pointer-events: auto;
  border-radius: 16px;
}

.info-modal {
  position: relative;
  width: 100%;
  max-width: 380px;
  max-height: calc(
    100dvh - 220px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)
  );
  overflow-y: auto;
  padding: 10px 12px;
  z-index: 20;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85);
}

.layer-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #334155;
}

.layer-modal-header h3 {
  font-size: 14px;
  font-weight: 700;
  color: #f8fafc;
}

.btn-close {
  background: #334155;
  border: none;
  color: #cbd5e1;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}

.btn-close:hover {
  color: white;
  background: #475569;
}

.info-content {
  font-size: 13px;
  color: #cbd5e1;
  line-height: 1.5;
}

.info-feature-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-feature-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
}

@media (max-width: 640px) {
  .info-modal {
    max-width: calc(100vw - 20px);
    max-height: calc(
      100dvh - 240px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)
    );
    padding: 10px;
  }
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.25s ease-out;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
