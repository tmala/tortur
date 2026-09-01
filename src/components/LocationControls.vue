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
  { id: 'tur', name: 'Tur- & Sykkelkart (CyclOSM)', desc: 'Stier, turruter og terreng' },
  { id: 'topo', name: 'Topografisk (OpenTopoMap)', desc: 'Høydekurver og terrengformasjoner' },
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
          <Mountain :size="16" />
          <span class="btn-tur-text">{{ activeKommuneName ? activeKommuneName : 'Turposter' }}</span>
          <span v-if="turpostCount > 0" class="badge-count">{{ turpostCount }}</span>
        </button>

        <!-- Kommunegrenser-knapp (Klikk-i-kart for å velge kommune) -->
        <button 
          class="icon-btn" 
          :class="{ active: showMunicipalities }"
          @click="emit('toggle-municipalities')" 
          title="Vis kommunegrenser (klikk i kartet for å velge kommune)"
        >
          <MapIcon :size="18" />
        </button>

        <!-- Kartlag-knapp -->
        <button 
          class="icon-btn" 
          :class="{ active: showLayerMenu }"
          @click="toggleLayerMenu" 
          title="Velg kartlag"
        >
          <Layers :size="18" />
        </button>

        <!-- Info-knapp -->
        <button 
          class="icon-btn" 
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
          <h3>Velg kartvisning (100% gratis)</h3>
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
              <span class="bullet">🗺️</span>
              <span><strong>Flere kartlag:</strong> Norgeskart, tur-/sykkelstier, terreng og satellitt uten API-nøkler.</span>
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
        <!-- Live tracking toggle knapp ("Følg meg") -->
        <button 
          class="btn-tracking glass-panel"
          :class="{ active: isTracking }"
          @click="emit('toggle-tracking')"
          :title="isTracking ? 'Stopp følging' : 'Følg posisjon kontinuerlig'"
        >
          <Compass :size="20" :class="{ spin: isTracking }" />
          <span class="btn-text">{{ isTracking ? 'Følger deg' : 'Følg meg' }}</span>
        </button>

        <!-- Hovedknapp: Finn posisjon -->
        <button 
          class="btn-locate"
          :class="{ locating: isLocating, has_loc: !!userLocation }"
          @click="emit('locate')"
          :disabled="isLocating"
          title="Sentrer kartet på min posisjon"
        >
          <Loader2 v-if="isLocating" :size="24" class="spin-icon" />
          <LocateFixed v-else-if="userLocation" :size="24" />
          <Navigation v-else :size="24" />
          <span class="btn-text-main">
            {{ isLocating ? 'Finner...' : (userLocation ? 'Min posisjon' : 'Hvor er jeg?') }}
          </span>
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
  width: 100%;
  height: 100%;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px;
  z-index: 10;
}

/* Glassmorphism Panel Base -> Solid Opaque High Contrast */
.glass-panel {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 16px;
  box-shadow: 0 12px 35px rgba(0, 0, 0, 0.7);
  pointer-events: auto;
  color: #f8fafc;
}

/* Topplinje */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  max-width: 580px;
  width: 100%;
  background: #0f172a;
  border: 1px solid #334155;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: linear-gradient(135deg, #0284c7, #2563eb);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);
}

.brand-text h1 {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.1;
  color: #f8fafc;
}

.brand-subtitle {
  font-size: 10px;
  color: #94a3b8;
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

.btn-turposter:hover {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
}

.btn-turposter.active {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
}

.badge-count {
  background: #10b981;
  color: #0f172a;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
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
  background: #1e1b2e !important; /* Helt ugjennomsiktig solid bakgrunn */
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
  color: #f8fafc; /* Hvit og tydelig tekst */
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
  border-radius: 20px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
}

.status-dot.idle {
  background: #64748b;
}

.loc-text.muted {
  color: #94a3b8;
}

.accuracy-badge {
  background: rgba(2, 132, 199, 0.3);
  color: #38bdf8;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
}

/* Handlingsknapper */
.action-buttons {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
}

.btn-tracking {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  border-radius: 28px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.15);
  transition: all 0.25s ease;
}

.btn-tracking:hover {
  background: rgba(255, 255, 255, 0.15);
}

.btn-tracking.active {
  background: rgba(16, 185, 129, 0.25);
  border-color: #10b981;
  color: #34d399;
}

.btn-locate {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #0284c7, #2563eb);
  color: white;
  border: none;
  padding: 14px 24px;
  border-radius: 28px;
  font-size: 15px;
  font-weight: 600;
  box-shadow: 0 6px 24px rgba(2, 132, 199, 0.45);
  cursor: pointer;
  pointer-events: auto;
  transition: all 0.25s ease;
}

.btn-locate:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(2, 132, 199, 0.6);
}

.btn-locate:active {
  transform: translateY(1px);
}

.btn-locate.locating {
  opacity: 0.85;
  cursor: wait;
}

.spin-icon, .spin {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Transisjonsanimasjoner */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.25s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
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
  50% { transform: scale(1.03); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

/* Responsiv tilpasning for mobil */
@media (max-width: 640px) {
  .controls-overlay {
    padding: 10px;
  }
  
  .top-bar {
    padding: 8px 10px;
  }

  .btn-tur-text {
    max-width: 80px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .btn-locate {
    padding: 12px 18px;
    font-size: 14px;
  }

  .btn-tracking {
    padding: 12px 14px;
    font-size: 13px;
  }
}
</style>
