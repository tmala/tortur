<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  Navigation,
  Layers,
  Compass,
  AlertTriangle,
  Loader2,
  Download,
  Check,
  Info,
  LocateFixed,
  Mountain,
  Map as MapIcon,
  Anchor,
  Radio,
  Settings,
  MapPin,
  ChevronDown,
  X,
} from 'lucide-vue-next'
import AuthPanel from './AuthPanel.vue'
import type { GeoLocationState } from '@/composables/useGeolocation'

const props = defineProps<{
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
  isAisToggled?: boolean
  isZoomSufficient?: boolean
  aisVesselCount?: number
  isAisLoading?: boolean
  currentZoom?: number
  minZoomForAis?: number
  isLoggedIn?: boolean
  isLoadingLocalTurposter?: boolean
}>()

const emit = defineEmits<{
  (e: 'locate'): void
  (e: 'toggle-tracking'): void
  (e: 'change-layer', layer: string): void
  (e: 'clear-error'): void
  (e: 'toggle-turposter'): void
  (e: 'toggle-municipalities'): void
  (e: 'toggle-ais'): void
  (e: 'show-local-turposter'): void
  (e: 'open-profile'): void
}>()

const showLayerMenu = ref(false)
const showInfoModal = ref(false)
const showAisModal = ref(false)
const installPrompt = ref<any>(null)
const isInstalled = ref(false)

const logoUrl = `${import.meta.env.BASE_URL}icon.svg`
const appVersion = __APP_VERSION__
const appTitle = 'TorTur'

const isMenuOpen = ref(false)

const toggleMenu = () => {
  isMenuOpen.value = !isMenuOpen.value
  if (!isMenuOpen.value) {
    showLayerMenu.value = false
    showAisModal.value = false
    showInfoModal.value = false
  }
}

const handleClickOutside = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (isMenuOpen.value && !target.closest('.top-left-wrapper')) {
    isMenuOpen.value = false
  }
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    if (showLayerMenu.value) {
      showLayerMenu.value = false
      return
    }
    if (showAisModal.value) {
      showAisModal.value = false
      return
    }
    if (showInfoModal.value) {
      showInfoModal.value = false
      return
    }
    if (isMenuOpen.value) {
      isMenuOpen.value = false
    }
  }
}

const availableLayers = computed(() => {
  const baseLayers = [
    {
      id: 'norgeskart',
      name: 'Kartverket Norgeskart',
      desc: 'Offisielt detaljert norgeskart (Kartverket)',
    },
    { id: 'standard', name: 'Standard OpenStreetMap', desc: 'Klassisk detaljert verdenskart' },
    {
      id: 'kartverket_sjokart',
      name: 'Kartverket Sjøkart',
      desc: 'Offisielt norsk sjøkart med dybder, fyr og merker',
    },
  ]

  const googleLayers = [
    { id: 'google_streets', name: 'Google Veikart', desc: 'Googles klassiske veikart' },
    {
      id: 'google_hybrid',
      name: 'Google Satellitt (Hybrid)',
      desc: 'Googles satellittfoto med veinavn og steder',
    },
    {
      id: 'google_terrain',
      name: 'Google Terreng',
      desc: 'Googles terrengkart med høydeforskjeller',
    },
  ]

  const otherLayers = [
    { id: 'tur', name: 'Tur- & Sykkelkart (CyclOSM)', desc: 'Stier, turruter og terreng' },
    { id: 'topo', name: 'Topografisk (OpenTopoMap)', desc: 'Høydekurver og terrengformasjoner' },
    {
      id: 'seamap',
      name: 'OpenSeaMap Sjøkart',
      desc: 'Globalt sjøkart med fyr, bøyer og sjømerker',
    },
    {
      id: 'satellite',
      name: 'Satellitt & Flyfoto (Esri)',
      desc: 'Ekte fly- og satellittbilder (Esri)',
    },
  ]

  return [...baseLayers, ...(props.isLoggedIn ? googleLayers : []), ...otherLayers]
})

const toggleLayerMenu = () => {
  showLayerMenu.value = !showLayerMenu.value
}

const selectLayer = (layerId: string) => {
  emit('change-layer', layerId)
  showLayerMenu.value = false
}

// Event listeners for install, click outside og escape
onMounted(() => {
  window.addEventListener('click', handleClickOutside)
  window.addEventListener('keydown', handleKeyDown)

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installPrompt.value = e
  })

  window.addEventListener('appinstalled', () => {
    isInstalled.value = true
    installPrompt.value = null
  })
})

onUnmounted(() => {
  window.removeEventListener('click', handleClickOutside)
  window.removeEventListener('keydown', handleKeyDown)
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
    <!-- Topp-venstre hjørne: Hovedmerkevare (TorTur), Login og Nedtrekksmeny med Turposter osv. -->
    <div class="top-left-wrapper">
      <header class="app-top-left-panel glass-panel">
        <button
          class="brand-badge-btn"
          @click="toggleMenu"
          :class="{ active: isMenuOpen }"
          title="Klikk for å vise/skjule meny med turposter og kartverktøy"
          aria-label="Åpne eller lukk verktøymeny"
          :aria-expanded="isMenuOpen"
        >
          <img :src="logoUrl" alt="TorTur logo" class="brand-logo-img" />
          <div class="brand-title-wrap">
            <span class="brand-title">{{ appTitle }}</span>
            <span class="brand-version">v{{ appVersion }}</span>
          </div>
          <ChevronDown :size="15" class="brand-chevron" :class="{ 'chevron-open': isMenuOpen }" />
        </button>

        <div class="brand-divider" />

        <AuthPanel @open-profile="emit('open-profile')" />
      </header>

      <!-- Menyen med Turposter osv. plassert RETT UNDER hovedmenypunktet -->
      <transition name="fade-slide">
        <div v-if="isMenuOpen" class="brand-menu-dropdown glass-panel" @click.stop>
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

            <!-- Hvor er jeg? -->
            <button
              class="icon-btn btn-locate"
              :disabled="isLocating"
              @click="emit('locate')"
              :title="isLocating ? 'Finner posisjon...' : 'Hvor er jeg?'"
              aria-label="Hvor er jeg?"
            >
              <Loader2 v-if="isLocating" class="spinner" :size="18" />
              <LocateFixed v-else :size="18" />
            </button>

            <!-- Vis turposter i min kommune -->
            <button
              class="icon-btn btn-local-turposter"
              :disabled="isLoadingLocalTurposter"
              @click="emit('show-local-turposter')"
              title="Vis turposter i min kommune"
              aria-label="Vis turposter i min kommune"
            >
              <Loader2 v-if="isLoadingLocalTurposter" class="spinner" :size="18" />
              <MapPin v-else :size="18" />
            </button>

            <!-- Følg meg -->
            <button
              class="icon-btn btn-track"
              :class="{ active: isTracking, 'is-tracking': isTracking }"
              @click="emit('toggle-tracking')"
              :title="isTracking ? 'Følger deg' : 'Følg meg'"
              aria-label="Følg meg"
            >
              <Compass :size="18" :class="{ 'pulse-slow': isTracking }" />
            </button>

            <!-- AIS Båttrafikk-knapp – kun synlig når innlogget -->
            <button
              v-if="isLoggedIn"
              class="btn-ais"
              :class="{
                active: isAisToggled && isZoomSufficient,
                'zoom-warning': isAisToggled && !isZoomSufficient,
              }"
              @click="emit('toggle-ais')"
              title="Slå av/på sanntids båttrafikk (AIS)"
            >
              <Anchor :size="16" class="anchor-icon" />
              <span v-if="isAisToggled && isZoomSufficient" class="btn-ais-text">
                AIS ({{ aisVesselCount || 0 }})
              </span>
              <span v-else-if="isAisToggled && !isZoomSufficient" class="btn-ais-text">
                AIS (Zoom inn)
              </span>
              <span v-else class="btn-ais-text">AIS</span>
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

            <!-- AIS-innstillinger / Kilde-knapp -->
            <button
              class="icon-btn"
              :class="{ active: showAisModal }"
              @click="showAisModal = !showAisModal"
              title="Båttrafikk (AIS) innstillinger"
            >
              <Radio :size="18" />
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

            <div class="menu-divider" />

            <!-- Lukk meny-knapp -->
            <button
              class="icon-btn btn-close-menu"
              @click="isMenuOpen = false"
              title="Lukk meny (Esc)"
              aria-label="Lukk meny"
            >
              <X :size="16" />
            </button>
          </div>
        </div>
      </transition>
    </div>

    <!-- AIS Modal -->
    <transition name="fade-slide">
      <div v-if="showAisModal" class="ais-modal glass-panel">
        <div class="layer-modal-header">
          <div class="ais-header-title">
            <Anchor :size="18" class="anchor-title-icon" />
            <h3>Båttrafikk i sanntid (AIS)</h3>
          </div>
          <button class="btn-close" @click="showAisModal = false">✕</button>
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
              Båttrafikk krever at du er zoomet inn på et nærområde (zoom 12 eller mer) for å unngå
              overbelastning.
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
            Dette er en <strong>Progressive Web App (PWA)</strong> med åpne kartdata fra
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
                ><strong>Klikk i kartet:</strong> Slå på kommunegrenser og klikk direkte på en
                kommune i kartet for å hente turpostene der.</span
              >
            </div>
            <div class="info-feature-item">
              <span class="bullet">⛰️</span>
              <span
                ><strong>Turposter i Norge:</strong> Utforsk over 15 000 turposter sortert etter
                fylke og kommune.</span
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

    <!-- Bunnkontrollpanel (Statuskapsel) -->
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
            Senter: {{ centerCoords.lat.toFixed(4) }}°, {{ centerCoords.lng.toFixed(4) }}° (Zoom
            {{ centerCoords.zoom }})
          </span>
        </div>
      </div>
    </div>


  </div>
</template>

<style scoped>
.controls-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
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

/* Topp-venstre modul */
.top-left-wrapper {
  position: absolute;
  top: calc(16px + env(safe-area-inset-top, 0px));
  left: calc(16px + env(safe-area-inset-left, 0px));
  z-index: 1100;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  pointer-events: auto;
}

.app-top-left-panel {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px 6px 8px;
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.brand-badge-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 3px 6px 3px 3px;
  border-radius: 10px;
  transition: all 0.2s ease;
  user-select: none;
}

.brand-badge-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.brand-badge-btn.active {
  background: rgba(56, 189, 248, 0.15);
}

.brand-logo-img {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  object-fit: cover;
  box-shadow: 0 2px 8px rgba(2, 132, 199, 0.4);
}

.brand-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.brand-title {
  font-size: 15px;
  font-weight: 700;
  color: #f8fafc;
  letter-spacing: -0.01em;
}

.brand-version {
  font-size: 10px;
  font-weight: 600;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.brand-chevron {
  color: #94a3b8;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  margin-left: 2px;
}

.brand-chevron.chevron-open {
  transform: rotate(180deg);
  color: #38bdf8;
}

.brand-divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.15);
  margin: 0 2px;
}

/* Menyen med Turposter osv. plassert RETT UNDER */
.brand-menu-dropdown {
  padding: 6px 8px;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
  max-width: calc(100vw - 32px);
}

.top-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.menu-divider {
  width: 1px;
  height: 22px;
  background: rgba(255, 255, 255, 0.15);
  margin: 0 2px;
}

.btn-close-menu {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
  color: #94a3b8;
}

.btn-close-menu:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: #ef4444;
  color: #fca5a5;
}

@media (max-width: 640px) {
  .top-left-wrapper {
    top: calc(10px + env(safe-area-inset-top, 0px));
    left: calc(10px + env(safe-area-inset-left, 0px));
  }
  .app-top-left-panel {
    padding: 5px 10px 5px 6px;
    gap: 8px;
  }
  .brand-logo-img {
    width: 28px;
    height: 28px;
  }
  .brand-version {
    display: none;
  }
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

.btn-turposter:hover,
.btn-turposter.active {
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

.icon-btn:hover,
.icon-btn.active {
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

.btn-ais {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #1e293b;
  border: 1px solid #334155;
  color: #94a3b8;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-ais:hover {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
}

.btn-ais.active {
  background: linear-gradient(135deg, #0284c7, #0284c7);
  border-color: #38bdf8;
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);
}

.btn-ais.zoom-warning {
  background: rgba(245, 158, 11, 0.2);
  border-color: #f59e0b;
  color: #fde68a;
}

/* AIS Modal */
.ais-modal {
  position: absolute;
  top: 124px;
  left: 16px;
  max-width: 440px;
  width: calc(100% - 32px);
  max-height: calc(100vh - 140px);
  overflow-y: auto;
  padding: 16px;
  z-index: 30;
  background: #0f172a;
  border: 1px solid #38bdf8;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85);
  color: #f8fafc;
}

.ais-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.anchor-title-icon {
  color: #38bdf8;
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

.ais-link {
  color: #38bdf8;
  text-decoration: underline;
}

.input-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.input-field label {
  font-size: 11px;
  font-weight: 600;
  color: #cbd5e1;
}

.ais-input {
  background: #0f172a;
  border: 1px solid #475569;
  border-radius: 6px;
  padding: 6px 10px;
  color: #f8fafc;
  font-size: 12px;
  font-family: monospace;
  outline: none;
}

.ais-input:focus {
  border-color: #38bdf8;
}

.ais-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.btn-ais-save {
  background: linear-gradient(135deg, #0284c7, #2563eb);
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.btn-ais-clear {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  border: 1px solid #ef4444;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.btn-local-turposter {
  color: #38bdf8;
}

.btn-local-turposter:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.2);
  border-color: #38bdf8;
  color: #ffffff;
}

.btn-local-turposter:disabled {
  opacity: 0.6;
  cursor: wait;
}

/* Lag- og infomodaler */
.layer-modal,
.info-modal {
  position: absolute;
  top: 124px;
  left: 16px;
  max-width: 380px;
  width: calc(100% - 32px);
  max-height: calc(100vh - 140px);
  overflow-y: auto;
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
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.8),
    0 0 0 1px rgba(239, 68, 68, 0.3);
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
  margin-bottom: env(safe-area-inset-bottom, 0px);
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
.icon-btn.btn-track.is-tracking {
  background: linear-gradient(135deg, #10b981, #059669);
  border-color: #34d399;
  color: white;
  box-shadow: 0 2px 10px rgba(16, 185, 129, 0.4);
}

.spinner {
  animation: spin 1s linear infinite;
}

.pulse-slow {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* Transisjoner */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.25s ease-out;
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
  0% {
    transform: scale(0.9);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
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
</style>
