<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { 
  Navigation, 
  Layers, 
  Compass, 
  MapPin, 
  AlertTriangle, 
  Loader2, 
  Download, 
  Check, 
  Info, 
  LocateFixed, 
  Mountain, 
  Map as MapIcon 
} from 'lucide-vue-next'
import type { GeoLocationState } from '@/composables/useGeolocation'

defineProps<{
  userLocation: GeoLocationState | null
  isLocating: boolean
  isTracking: boolean
  error: string | null
  activeLayer: string
  centerCoords: { lat: number; lng: number; zoom: number } | null
  isTurposterOpen: boolean
  activeKommuneName: string | null
  turpostCount: number
  showMunicipalities: boolean
}>()

const emit = defineEmits<{
  (e: 'locate'): void
  (e: 'toggle-tracking'): void
  (e: 'change-layer', layer: string): void
  (e: 'clear-error'): void
  (e: 'toggle-turposter'): void
  (e: 'toggle-municipalities'): void
}>()

const showLayerMenu = ref(false)
const showInfoModal = ref(false)
const installPrompt = ref<any>(null)
const isInstalled = ref(false)

const availableLayers = [
  { id: 'standard', name: 'Standard OpenStreetMap', desc: 'Klassisk detaljert verdenskart' },
  { id: 'norgeskart', name: 'Kartverket Norgeskart', desc: 'Offisielt detaljert norgeskart (Kartverket)' },
  { id: 'kartverket_sjokart', name: 'Kartverket Sjøkart', desc: 'Offisielt norsk sjøkart med dybder, fyr og merker' },
  { id: 'tur', name: 'Tur- & Sykkelkart (CyclOSM)', desc: 'Stier, turruter og terreng' },
  { id: 'topo', name: 'Topografisk (OpenTopoMap)', desc: 'Høydekurver og terrengformasjoner' },
  { id: 'seamap', name: 'OpenSeaMap Sjøkart', desc: 'Globalt sjøkart med fyr, bøyer og sjømerker' },
  { id: 'satellite', name: 'Satellitt & Flyfoto (Esri)', desc: 'Ekte fly- og satellittbilder' }
]

const toggleLayerMenu = () => {
  showLayerMenu.value = !showLayerMenu.value
}

const selectLayer = (layerId: string) => {
  emit('change-layer', layerId)
  showLayerMenu.value = false
}

// PWA Install prompt handling
onMounted(() => {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installPrompt.value = e
  })

  window.addEventListener('appinstalled', () => {
    isInstalled.value = true
    installPrompt.value = null
  })
})

const handleInstallClick = async () => {
  if (!installPrompt.value) return
  installPrompt.value.prompt()
  const choiceResult = await installPrompt.value.userChoice
  if (choiceResult.outcome === 'accepted') {
    isInstalled.value = true
  }
  installPrompt.value = null
}
</script>

<template>
  <div class="controls-overlay">
    <!-- Topplinje med logo, tittel, turposter og innstillinger -->
    <header class="top-bar glass-panel">
      <div class="brand">
        <div class="brand-icon">
          <MapPin :size="20" class="brand-pin" />
        </div>
        <div class="brand-text">
          <h1>Kart</h1>
          <span class="brand-subtitle">OpenStreetMap PWA</span>
        </div>
      </div>

      <div class="top-actions">
        <!-- Turposter-knapp -->
        <button 
          class="btn-turposter" 
          :class="{ active: isTurposterOpen || activeKommuneName }"
          @click="emit('toggle-turposter')"
          title="Vis turposter etter fylke og kommune"
        >
          <Mountain :size="16" class="mountain-icon" />
          <span v-if="activeKommuneName" class="kommune-tag">
            {{ activeKommuneName }} ({{ turpostCount }})
          </span>
          <span v-else>Turposter</span>
        </button>

        <!-- Kommunegrenser-knapp -->
        <button 
          class="icon-btn" 
          :class="{ active: showMunicipalities }"
          @click="emit('toggle-municipalities')"
          title="Slå av/på visning av kommunegrenser"
        >
          <MapIcon :size="18" />
        </button>

        <!-- Kartlag-knapp -->
        <button 
          class="icon-btn" 
          :class="{ active: showLayerMenu }"
          @click="toggleLayerMenu"
          title="Bytt kartlag"
        >
          <Layers :size="18" />
        </button>

        <!-- Info-knapp -->
        <button 
          class="icon-btn" 
          :class="{ active: showInfoModal }"
          @click="showInfoModal = !showInfoModal"
          title="Om appen"
        >
          <Info :size="18" />
        </button>

        <!-- PWA Install-knapp (vises hvis tilgjengelig) -->
        <button 
          v-if="installPrompt && !isInstalled" 
          class="btn-install" 
          @click="handleInstallClick"
          title="Installer som app på enheten"
        >
          <Download :size="15" />
          <span>Installer</span>
        </button>
      </div>
    </header>

    <!-- Kartlag-velgermeny -->
    <transition name="fade-slide">
      <div v-if="showLayerMenu" class="layer-modal glass-panel">
        <div class="layer-modal-header">
          <h3>Velg kartvisning</h3>
          <button class="btn-close" @click="showLayerMenu = false">✕</button>
        </div>
        <div class="layer-options">
          <button
            v-for="layer in availableLayers" 
            :key="layer.id"
            class="layer-item"
            :class="{ selected: activeLayer === layer.id }"
            @click="selectLayer(layer.id)"
          >
            <div class="layer-info">
              <span class="layer-name">{{ layer.name }}</span>
              <span class="layer-desc">{{ layer.desc }}</span>
            </div>
            <Check v-if="activeLayer === layer.id" :size="18" class="check-icon" />
          </button>
        </div>
      </div>
    </transition>

    <!-- Info-modal -->
    <transition name="fade-slide">
      <div v-if="showInfoModal" class="info-modal glass-panel">
        <div class="layer-modal-header">
          <h3>Om kartappen</h3>
          <button class="btn-close" @click="showInfoModal = false">✕</button>
        </div>
        <div class="info-content">
          <p>
            Dette er en <strong>Progressive Web App (PWA)</strong> med åpne kartdata fra <strong>OpenStreetMap</strong> og <strong>Kartverket</strong>.
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
              <span><strong>Klikk i kartet:</strong> Slå på kommunegrenser og klikk direkte på en kommune i kartet for å hente turpostene der.</span>
            </div>
            <div class="info-feature-item">
              <span class="bullet">⛰️</span>
              <span><strong>Turposter i Norge:</strong> Utforsk over 15 000 turposter sortert etter fylke og kommune.</span>
            </div>
            <div class="info-feature-item">
              <span class="bullet">⛵</span>
              <span><strong>Sjøkart:</strong> Offisielt norsk sjøkart fra Kartverket (med dybder og fyrlykter) og globalt OpenSeaMap.</span>
            </div>
            <div class="info-feature-item">
              <span class="bullet">⚡</span>
              <span><strong>PWA Offline Cache:</strong> Kan installeres på mobilen eller skrivebordet.</span>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- Feilmelding / Varsel -->
    <transition name="bounce">
      <div v-if="error" class="error-banner glass-panel">
        <div class="error-content">
          <AlertTriangle :size="20" class="error-icon" />
          <div class="error-text">
            <span>{{ error }}</span>
          </div>
        </div>
        <div class="error-actions">
          <button class="btn-retry" @click="emit('locate')">Prøv igjen</button>
          <button class="btn-dismiss" @click="emit('clear-error')">Lukk</button>
        </div>
      </div>
    </transition>

    <!-- Bunnkontrollpanel (Posisjonsknapp & Status) -->
    <div class="bottom-bar">
      <!-- Statuskapsel (Koordinater & Nøyaktighet) -->
      <div class="status-pill glass-panel">
        <div v-if="userLocation" class="loc-data">
          <span class="status-dot online"></span>
          <span class="loc-text">
            {{ userLocation.lat.toFixed(4) }}°, {{ userLocation.lng.toFixed(4) }}°
          </span>
          <span v-if="userLocation.accuracy" class="accuracy-badge">
            ±{{ Math.round(userLocation.accuracy) }}m
          </span>
        </div>
        <div v-else-if="centerCoords" class="loc-data">
          <span class="status-dot idle"></span>
          <span class="loc-text muted">
            Senter: {{ centerCoords.lat.toFixed(4) }}°, {{ centerCoords.lng.toFixed(4) }}° (Zoom {{ centerCoords.zoom }})
          </span>
        </div>
      </div>

      <!-- Handlingsknapper -->
      <div class="action-buttons">
        <button 
          class="btn-action btn-locate glass-panel" 
          :disabled="isLocating"
          @click="emit('locate')"
          title="Finn min posisjon"
        >
          <Loader2 v-if="isLocating" class="spinner" :size="20" />
          <LocateFixed v-else :size="20" />
          <span>Hvor er jeg?</span>
        </button>

        <button 
          class="btn-action btn-track glass-panel"
          :class="{ 'is-tracking': isTracking }"
          @click="emit('toggle-tracking')"
          title="Følg min posisjon kontinuerlig"
        >
          <Compass :size="20" :class="{ 'pulse-slow': isTracking }" />
          <span>{{ isTracking ? 'Følger deg' : 'Følg meg' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.controls-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 10;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px;
  box-sizing: border-box;
}

.glass-panel {
  pointer-events: auto;
  border-radius: 16px;
}

/* Topplinje */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  gap: 12px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-icon {
  background: linear-gradient(135deg, #0284c7, #0369a1);
  color: white;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4);
}

.brand-text h1 {
  font-size: 16px;
  font-weight: 700;
  color: #f8fafc;
  line-height: 1.2;
}

.brand-subtitle {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-turposter {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #1e293b;
  border: 1px solid #334155;
  color: #f8fafc;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-turposter:hover, .btn-turposter.active {
  background: linear-gradient(135deg, #0284c7, #2563eb);
  border-color: #38bdf8;
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);
}

.kommune-tag {
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}

.icon-btn {
  background: #1e293b;
  border: 1px solid #334155;
  color: #f8fafc;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.icon-btn:hover, .icon-btn.active {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
}

.btn-install {
  display: flex;
  align-items: center;
  gap: 5px;
  background: linear-gradient(135deg, #0284c7, #0369a1);
  border: none;
  color: white;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4);
}

/* Lag- og infomodaler */
.layer-modal, .info-modal {
  position: absolute;
  top: 72px;
  left: 16px;
  max-width: 380px;
  width: calc(100% - 32px);
  padding: 16px;
  z-index: 20;
  background: #0f172a;
  border: 1px solid #334155;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8);
}

.layer-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #334155;
}

.layer-modal-header h3 {
  font-size: 15px;
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

.layer-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.layer-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 14px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 10px;
  color: #f8fafc;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.layer-item:hover {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
}

.layer-item.selected {
  background: #1e3a5f;
  border-color: #38bdf8;
}

.layer-info {
  display: flex;
  flex-direction: column;
}

.layer-name {
  font-size: 13px;
  font-weight: 600;
}

.layer-desc {
  font-size: 11px;
  color: #94a3b8;
}

.check-icon {
  color: #38bdf8;
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

/* Feilbanner - 100% ugjennomsiktig for optimal lesbarhet */
.error-banner {
  align-self: center;
  max-width: 480px;
  width: 100%;
  padding: 14px 16px;
  border: 2px solid #ef4444 !important;
  background: #1e1b2e !important;
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(239, 68, 68, 0.3);
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 10px;
  z-index: 100;
}

.error-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.error-icon {
  color: #f87171;
  flex-shrink: 0;
}

.error-text {
  font-size: 14px;
  font-weight: 500;
  color: #f8fafc;
  line-height: 1.4;
}

.error-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-retry {
  background: #dc2626;
  color: #ffffff;
  border: 1px solid #ef4444;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-retry:hover {
  background: #b91c1c;
}

.btn-dismiss {
  background: #334155;
  color: #f8fafc;
  border: 1px solid #475569;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-dismiss:hover {
  background: #475569;
}

/* Bunnlinje */
.bottom-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
}

/* Statuskapsel */
.status-pill {
  padding: 6px 14px;
  font-size: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

.loc-data {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.online {
  background-color: var(--success);
  box-shadow: 0 0 8px var(--success);
}

.status-dot.idle {
  background-color: var(--text-muted);
}

.loc-text {
  font-weight: 500;
  color: #f8fafc;
}

.loc-text.muted {
  color: #94a3b8;
}

.accuracy-badge {
  background: rgba(2, 132, 199, 0.2);
  color: var(--accent);
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
}

/* Aksjonsknapper */
.action-buttons {
  display: flex;
  gap: 12px;
  width: 100%;
}

.btn-action {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #f8fafc;
  cursor: pointer;
  border: 1px solid #334155;
  background: #0f172a;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}

.btn-locate:hover {
  background: linear-gradient(135deg, #0284c7, #0369a1);
  border-color: #38bdf8;
  color: white;
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(2, 132, 199, 0.4);
}

.btn-track {
  background: #1e293b;
}

.btn-track:hover {
  background: #334155;
  border-color: #64748b;
  transform: translateY(-2px);
}

.btn-track.is-tracking {
  background: linear-gradient(135deg, #10b981, #059669);
  border-color: #34d399;
  color: white;
  box-shadow: 0 8px 20px rgba(16, 185, 129, 0.4);
}

.spinner {
  animation: spin 1s linear infinite;
}

.pulse-slow {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .5; }
}

/* Transisjoner */
.fade-slide-enter-active, .fade-slide-leave-active {
  transition: all 0.25s ease-out;
}

.fade-slide-enter-from, .fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.bounce-enter-active {
  animation: bounce-in 0.3s;
}

.bounce-leave-active {
  animation: bounce-in 0.2s reverse;
}

@keyframes bounce-in {
  0% { transform: scale(0.9); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
</style>
