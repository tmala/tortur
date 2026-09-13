<script setup lang="ts">
import {
  LocateFixed,
  Route,
  Map as MapIcon,
  Mountain,
  Layers,
  MapPin,
  X,
  FolderHeart,
} from 'lucide-vue-next'

defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <transition name="fade-slide">
    <div v-if="isOpen" class="info-modal glass-panel" @click.stop>
      <div class="layer-modal-header">
        <h3>Om TorTur</h3>
        <button class="btn-close" @click="emit('close')" title="Lukk" aria-label="Lukk">
          <X :size="14" />
        </button>
      </div>
      <div class="info-content">
        <p>
          TorTur er en <strong>Progressive Web App (PWA)</strong> med åpne kartdata fra
          <strong>OpenStreetMap</strong> og <strong>Kartverket</strong>.
        </p>
        <div class="info-feature-list">
          <div class="info-feature-item">
            <span class="feature-icon-badge" title="Turposter">
              <Mountain :size="15" />
            </span>
            <div class="feature-text">
              <strong>Turposter:</strong> Utforsk over 15 000 turposter i Norge sortert etter fylke
              og kommune. Det er også turposter enkelte steder i utlandet
            </div>
          </div>
          <div class="info-feature-item">
            <span class="feature-icon-badge" title="Vis turposter der jeg er">
              <MapPin :size="15" />
            </span>
            <div class="feature-text">
              <strong>Vis turposter der jeg er:</strong> Viser turposter der du er og sentrerer
              kartet rundt deg.
            </div>
          </div>
          <div class="info-feature-item">
            <span class="feature-icon-badge" title="Hvor er jeg">
              <LocateFixed :size="15" />
            </span>
            <div class="feature-text">
              <strong>Hvor er jeg:</strong> Viser posisjonen din og sentrerer kartet rundt deg.
            </div>
          </div>
          <div class="info-feature-item">
            <span class="feature-icon-badge" title="Følg meg">
              <Route :size="15" />
            </span>
            <div class="feature-text">
              <strong>Følg meg:</strong> Sporer bevegelsene dine fortløpende ("on"/"off")
            </div>
          </div>

          <div class="info-feature-item">
            <span class="feature-icon-badge" title="Lagrede spor">
              <FolderHeart :size="15" />
            </span>
            <div class="feature-text">
              <strong>Lagrede spor:</strong> Viser dine lagrede GPS-spor. Herfra kan du velge å
              lagre dem i sky og/eller laste dem ned
            </div>
          </div>

          <div class="info-feature-item">
            <span class="feature-icon-badge" title="Grenser">
              <MapIcon :size="15" />
            </span>
            <div class="feature-text">
              <strong>Grenser:</strong> Slå på kommunegrenser og klikk direkte på en kommune i
              kartet for å hente turpostene der (fungerer kun for Norge).
            </div>
          </div>
          <div class="info-feature-item">
            <span class="feature-icon-badge" title="Kartlag">
              <Layers :size="15" />
            </span>
            <div class="feature-text">
              <strong>Kartlag:</strong> Velg hvilket kartlag som skal brukes.
            </div>
          </div>
        </div>
      </div>
      <br />
      <div class="info-content" align="center">
        <a href="privacy.html">Personvern</a> &nbsp;&nbsp;
        <a href="termsofservice.html">Brukervilkår</a>
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
  display: flex;
  align-items: center;
  justify-content: center;
  background: #334155;
  border: none;
  color: #cbd5e1;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  transition: all 0.15s ease;
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
  gap: 10px;
}

.info-feature-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 12px;
  line-height: 1.4;
}

.feature-icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  min-width: 24px;
  border-radius: 6px;
  background: #1e293b;
  border: 1px solid #334155;
  color: #38bdf8;
  flex-shrink: 0;
  margin-top: 1px;
}

.feature-text {
  flex: 1;
}

.feature-text strong {
  color: #f8fafc;
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
