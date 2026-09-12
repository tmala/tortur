<script setup lang="ts">
import { Anchor, Radio } from 'lucide-vue-next'

defineProps<{
  isOpen: boolean
  isAdmin?: boolean
  isLoggedIn?: boolean
  currentZoom?: number
  minZoomForAis?: number
  isZoomSufficient?: boolean
  isAisToggled?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <transition name="fade-slide">
    <div v-if="isAdmin && isOpen" class="ais-modal glass-panel" @click.stop>
      <div class="layer-modal-header">
        <div class="ais-header-title">
          <Anchor :size="18" class="anchor-title-icon" />
          <h3>Båttrafikk i sanntid (AIS)</h3>
        </div>
        <button class="btn-close" @click="emit('close')">✕</button>
      </div>
      <div class="ais-modal-content">
        <p class="ais-desc">
          Viser posisjoner, fart og kurs for skip i sanntid fra
          <strong>Kystverket / BarentsWatch</strong>.
        </p>

        <div
          class="ais-status-box"
          :class="{ ok: isZoomSufficient, warn: isAisToggled && !isZoomSufficient }"
        >
          <div class="status-box-header">
            <strong>🔍 Zoom-status:</strong>
            <span>Zoom {{ currentZoom || 13 }} / min. {{ minZoomForAis || 12 }}</span>
          </div>
          <p v-if="!isZoomSufficient" class="status-box-msg">
            Båttrafikk krever at du er zoomet inn på et nærområde (zoom 12 eller mer) for å
            unngå overbelastning.
          </p>
          <p v-else class="status-box-msg ok-msg">
            ✓ Kartutsnittet er nært nok til å vise båter i sanntid.
          </p>
        </div>

        <div class="ais-credentials-section">
          <div class="section-title">
            <Radio :size="14" />
            <span>BarentsWatch API</span>
          </div>
          <p class="section-subtext">
            AIS krever at du er innlogget med google-konto (og at din google-bruker er på TorTur
            sin WhiteList). Data leveres av <strong>Kystverket / BarentsWatch</strong>.
          </p>
          <div class="ais-config-info" :class="{ 'config-ok': isLoggedIn }">
            <span v-if="isLoggedIn">✓ AIS-nøkler er aktive</span>
            <span v-else>Logg inn for å aktivere AIS-tilgang</span>
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

.ais-modal {
  position: relative;
  width: 100%;
  max-width: 440px;
  max-height: calc(
    100dvh - 220px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)
  );
  overflow-y: auto;
  padding: 14px;
  z-index: 20;
  background: #0f172a;
  border: 1px solid #38bdf8;
  border-radius: 14px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85);
  color: #f8fafc;
}

.layer-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #334155;
}

.ais-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ais-header-title h3 {
  font-size: 14px;
  font-weight: 700;
  color: #f8fafc;
}

.anchor-title-icon {
  color: #38bdf8;
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

.ais-modal-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ais-desc {
  font-size: 13px;
  color: #cbd5e1;
  line-height: 1.4;
}

.ais-status-box {
  background: #1e293b;
  border: 1px solid #334155;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 12px;
}

.ais-status-box.ok {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}

.ais-status-box.warn {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}

.status-box-header {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 4px;
}

.status-box-msg {
  font-size: 12px;
  color: #fde68a;
  margin: 0;
}

.status-box-msg.ok-msg {
  color: #6ee7b7;
}

.ais-credentials-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #1e293b;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #334155;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #38bdf8;
}

.section-subtext {
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.4;
  margin: 0;
}

.ais-config-info {
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.25);
  color: #fca5a5;
  text-align: center;
}

.ais-config-info.config-ok {
  background: rgba(34, 197, 94, 0.1);
  border-color: rgba(34, 197, 94, 0.3);
  color: #86efac;
}

@media (max-width: 640px) {
  .ais-modal {
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
