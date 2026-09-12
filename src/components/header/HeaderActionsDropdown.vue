<script setup lang="ts">
import {
  Layers,
  Route,
  FileDown,
  Loader2,
  Download,
  Info,
  LocateFixed,
  Mountain,
  Map as MapIcon,
  Anchor,
  Radio,
  MapPin,
  X,
  FolderHeart,
  RefreshCw,
} from 'lucide-vue-next'

defineProps<{
  isOpen: boolean
  isTurposterOpen?: boolean
  activeKommuneName?: string | null
  turpostCount?: number
  isLoadingLocalTurposter?: boolean
  isLocating?: boolean
  isTracking?: boolean
  hasTrack?: boolean
  isSavedTracksOpen?: boolean
  savedTracksCount?: number
  isAdmin?: boolean
  isAisToggled?: boolean
  isZoomSufficient?: boolean
  aisVesselCount?: number
  showMunicipalities?: boolean
  showLayerMenu?: boolean
  showAisModal?: boolean
  showInfoModal?: boolean
  showInstallPrompt?: boolean
  needsUpdate?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'toggle-turposter'): void
  (e: 'show-local-turposter'): void
  (e: 'locate'): void
  (e: 'toggle-tracking'): void
  (e: 'open-track-modal'): void
  (e: 'open-saved-tracks'): void
  (e: 'toggle-ais'): void
  (e: 'toggle-municipalities'): void
  (e: 'toggle-layers'): void
  (e: 'toggle-ais-modal'): void
  (e: 'toggle-info-modal'): void
  (e: 'install'): void
  (e: 'apply-update'): void
}>()
</script>

<template>
  <transition name="fade-slide">
    <div v-if="isOpen" class="brand-menu-dropdown glass-panel" @click.stop>
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

        <!-- Vis turposter der jeg er -->
        <button
          class="icon-btn btn-local-turposter"
          :disabled="isLoadingLocalTurposter"
          @click="emit('show-local-turposter')"
          title="Vis turposter der jeg er"
          aria-label="Vis turposter der jeg er"
        >
          <Loader2 v-if="isLoadingLocalTurposter" class="spinner" :size="18" />
          <MapPin v-else :size="18" />
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

        <!-- Sporlogg / Følg meg -->
        <button
          class="icon-btn btn-track"
          :class="{ active: isTracking, 'is-tracking': isTracking, 'has-track': hasTrack }"
          @click="emit('toggle-tracking')"
          :title="
            isTracking
              ? 'Følger deg (sporing aktiv)'
              : hasTrack
                ? 'Sporing stoppet (sporet vises på kartet)'
                : 'Følg meg'
          "
          aria-label="Følg meg"
        >
          <Route :size="18" :class="{ 'pulse-slow': isTracking }" />
        </button>

        <!-- Sporlogg-valg (last ned GPX eller slett) -->
        <button
          v-if="hasTrack"
          class="icon-btn btn-track-menu"
          @click="emit('open-track-modal')"
          title="Sporlogg (last ned GPX eller slett spor)"
          aria-label="Sporlogg"
        >
          <FileDown :size="18" />
        </button>

        <!-- Mine lagrede GPS-spor -->
        <button
          class="icon-btn btn-saved-tracks"
          :class="{ active: isSavedTracksOpen }"
          @click="emit('open-saved-tracks')"
          title="Mine lagrede GPS-spor"
          aria-label="Mine lagrede GPS-spor"
        >
          <FolderHeart :size="18" />
          <span v-if="savedTracksCount && savedTracksCount > 0" class="btn-badge-count">
            {{ savedTracksCount }}
          </span>
        </button>

        <!-- AIS Båttrafikk-knapp – kun synlig for admin -->
        <button
          v-if="isAdmin"
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
          class="btn-municipalities"
          :class="{ active: showMunicipalities }"
          @click="emit('toggle-municipalities')"
          title="Slå av/på visning av kommunegrenser"
          aria-label="Slå av eller på visning av kommunegrenser"
        >
          <MapIcon :size="16" class="map-icon" />
          <span v-if="showMunicipalities" class="btn-municipalities-text">Grenser (På)</span>
          <span v-else class="btn-municipalities-text">Grenser</span>
        </button>

        <!-- Kartlag-knapp -->
        <button
          class="icon-btn"
          :class="{ active: showLayerMenu }"
          @click="emit('toggle-layers')"
          title="Bytt kartlag"
        >
          <Layers :size="18" />
        </button>

        <!-- AIS-innstillinger / Kilde-knapp – kun synlig for admin -->
        <button
          v-if="isAdmin"
          class="icon-btn"
          :class="{ active: showAisModal }"
          @click="emit('toggle-ais-modal')"
          title="Båttrafikk (AIS) innstillinger"
        >
          <Radio :size="18" />
        </button>

        <!-- Info-knapp -->
        <button
          class="icon-btn"
          :class="{ active: showInfoModal }"
          @click="emit('toggle-info-modal')"
          title="Om appen"
        >
          <Info :size="18" />
        </button>

        <!-- PWA Install-knapp (vises hvis tilgjengelig) -->
        <button
          v-if="showInstallPrompt"
          class="btn-install"
          @click="emit('install')"
          title="Installer som app på enheten"
        >
          <Download :size="15" />
          <span>Installer</span>
        </button>

        <div class="menu-divider" />

        <!-- Lukk meny-knapp -->
        <button
          class="icon-btn btn-close-menu"
          @click="emit('close')"
          title="Lukk meny (Esc)"
          aria-label="Lukk meny"
        >
          <X :size="16" />
        </button>
      </div>

      <!-- Oppdateringsbanner – vises når ny versjon er lastet ned -->
      <transition name="fade-slide">
        <button
          v-if="needsUpdate"
          class="update-banner"
          @click="emit('apply-update')"
          title="Last inn ny versjon av appen"
          aria-label="Oppdater app til ny versjon"
        >
          <RefreshCw :size="15" class="update-banner-icon" />
          <span>Ny versjon tilgjengelig – trykk for å laste inn</span>
        </button>
      </transition>
    </div>
  </transition>
</template>

<style scoped>
.glass-panel {
  pointer-events: auto;
  border-radius: 16px;
}

.brand-menu-dropdown {
  padding: 6px 8px;
  background: #0f172a;
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

.icon-btn.btn-track.is-tracking {
  background: linear-gradient(135deg, #10b981, #059669);
  border-color: #34d399;
  color: white;
  box-shadow: 0 2px 10px rgba(16, 185, 129, 0.4);
}

.icon-btn.btn-track.has-track:not(.is-tracking) {
  border-color: rgba(249, 115, 22, 0.6);
  color: #f97316;
  background: rgba(249, 115, 22, 0.1);
}

.icon-btn.btn-track-menu {
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.35);
  background: rgba(56, 189, 248, 0.08);
}

.icon-btn.btn-track-menu:hover {
  background: rgba(56, 189, 248, 0.22);
  color: #ffffff;
  border-color: #38bdf8;
}

.icon-btn.btn-saved-tracks {
  position: relative;
  color: #cbd5e1;
}

.icon-btn.btn-saved-tracks:hover {
  color: #f97316;
  border-color: rgba(249, 115, 22, 0.5);
  background: rgba(249, 115, 22, 0.1);
}

.icon-btn.btn-saved-tracks.active {
  background: rgba(249, 115, 22, 0.2);
  border-color: #f97316;
  color: #f97316;
}

.icon-btn.btn-saved-tracks .btn-badge-count {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #ea580c;
  color: white;
  font-size: 10px;
  font-weight: 700;
  min-width: 15px;
  height: 15px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  border: 1px solid #0f172a;
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

.btn-municipalities {
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

.btn-municipalities:hover {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
}

.btn-municipalities.active {
  background: linear-gradient(135deg, #0284c7, #0284c7);
  border-color: #38bdf8;
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);
}

.map-icon {
  flex-shrink: 0;
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

.update-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-top: 6px;
  padding: 10px 14px;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.18), rgba(251, 146, 60, 0.18));
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 10px;
  color: #fca5a5;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition:
    background 0.2s ease,
    border-color 0.2s ease;
}

.update-banner:hover {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(251, 146, 60, 0.3));
  border-color: #ef4444;
  color: #fff;
}

.update-banner-icon {
  flex-shrink: 0;
  animation: spin-slow 3s linear infinite;
}

@keyframes spin-slow {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
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
