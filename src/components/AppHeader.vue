<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import AuthPanel from './AuthPanel.vue'
import AboutAppModal from './AboutAppModal.vue'
import HeaderActionsDropdown from './header/HeaderActionsDropdown.vue'
import AisInfoModal from './header/AisInfoModal.vue'

const props = withDefaults(
  defineProps<{
    activeLayer?: string
    isTurposterOpen: boolean
    activeKommuneName: string | null
    turpostCount: number
    isAisToggled?: boolean
    isZoomSufficient?: boolean
    aisVesselCount?: number
    isAisLoading?: boolean
    currentZoom?: number
    minZoomForAis?: number
    isLoggedIn?: boolean
    isAdmin?: boolean
    isAdminActive?: boolean
    isLoadingLocalTurposter?: boolean
    isLocating?: boolean
    isLiveLocating?: boolean
    isTracking?: boolean
    hasTrack?: boolean
    savedTracksCount?: number
    isSavedTracksOpen?: boolean
    /** true når en ny versjon er tilgjengelig via Service Worker */
    needsUpdate?: boolean
    mySpotsCount?: number
    isMySpotsOpen?: boolean
    isAddSpotModeActive?: boolean
  }>(),
  {
    activeLayer: 'norgeskart',
    isAdminActive: true,
  }
)

const emit = defineEmits<{
  (e: 'locate'): void
  (e: 'toggle-tracking'): void
  (e: 'open-track-modal'): void
  (e: 'open-saved-tracks'): void
  (e: 'open-my-spots'): void
  (e: 'toggle-add-spot-mode'): void
  (e: 'toggle-turposter'): void
  (e: 'toggle-ais'): void
  (e: 'show-local-turposter'): void
  (e: 'open-profile'): void
  (e: 'apply-update'): void
}>()

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const showInfoModal = ref(false)
const showAisModal = ref(false)
const installPrompt = ref<BeforeInstallPromptEvent | null>(null)
const isInstalled = ref(false)

const logoUrl = `${import.meta.env.BASE_URL}icon.svg`
const appVersion = __APP_VERSION__
const appTitle = 'TorTur'

const isMenuOpen = ref(false)

const handleToggleTurposter = () => {
  isMenuOpen.value = false
  emit('toggle-turposter')
}

const handleOpenTrackModal = () => {
  isMenuOpen.value = false
  emit('open-track-modal')
}

const handleOpenProfile = () => {
  isMenuOpen.value = false
  emit('open-profile')
}

watch(
  () => props.isTurposterOpen,
  (isOpen) => {
    if (isOpen) {
      isMenuOpen.value = false
    }
  }
)

const toggleMenu = () => {
  isMenuOpen.value = !isMenuOpen.value
  if (!isMenuOpen.value) {
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

onMounted(() => {
  window.addEventListener('click', handleClickOutside)
  window.addEventListener('keydown', handleKeyDown)

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installPrompt.value = e as BeforeInstallPromptEvent
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
        <!-- Logo med pulserende oppdateringsprikk når ny versjon er klar -->
        <span class="brand-logo-wrap">
          <img :src="logoUrl" alt="TorTur logo" class="brand-logo-img" />
          <span v-if="needsUpdate" class="update-dot" title="Ny versjon tilgjengelig!" />
        </span>
        <div class="brand-title-wrap">
          <span class="brand-title">{{ appTitle }}</span>
          <span class="brand-version">v{{ appVersion }}</span>
        </div>
        <ChevronDown :size="15" class="brand-chevron" :class="{ 'chevron-open': isMenuOpen }" />
      </button>

      <div class="brand-divider" />

      <AuthPanel @open-profile="handleOpenProfile" />
    </header>

    <!-- Verktøymeny med Turposter, GPS, lag etc. -->
    <HeaderActionsDropdown
      :is-open="isMenuOpen"
      :is-turposter-open="isTurposterOpen"
      :active-kommune-name="activeKommuneName"
      :turpost-count="turpostCount"
      :is-loading-local-turposter="isLoadingLocalTurposter"
      :is-locating="isLocating"
      :is-live-locating="isLiveLocating"
      :is-tracking="isTracking"
      :has-track="hasTrack"
      :is-admin="isAdmin && isAdminActive"
      :is-ais-toggled="isAisToggled"
      :is-zoom-sufficient="isZoomSufficient"
      :ais-vessel-count="aisVesselCount"
      :show-ais-modal="showAisModal"
      :show-info-modal="showInfoModal"
      :show-install-prompt="!!installPrompt && !isInstalled"
      :needs-update="needsUpdate"
      @close="isMenuOpen = false"
      @toggle-turposter="handleToggleTurposter"
      @show-local-turposter="emit('show-local-turposter')"
      @locate="emit('locate')"
      @toggle-tracking="emit('toggle-tracking')"
      @open-track-modal="handleOpenTrackModal"
      @toggle-ais="emit('toggle-ais')"
      @toggle-ais-modal="showAisModal = !showAisModal"
      @toggle-info-modal="showInfoModal = !showInfoModal"
      @install="handleInstallClick"
      @apply-update="emit('apply-update')"
    />

    <!-- AIS Modal – kun synlig for admin med aktiv admin-modus -->
    <AisInfoModal
      :is-open="showAisModal"
      :is-admin="isAdmin && isAdminActive"
      :is-logged-in="isLoggedIn"
      :current-zoom="currentZoom"
      :min-zoom-for-ais="minZoomForAis"
      :is-zoom-sufficient="isZoomSufficient"
      :is-ais-toggled="isAisToggled"
      @close="showAisModal = false"
    />

    <!-- Info-modal («Om appen») -->
    <AboutAppModal :is-open="showInfoModal" @close="showInfoModal = false" />
  </div>
</template>

<style scoped>
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
  background: #0f172a;
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

/* Logo-wrapper for å posisjonere oppdateringsprikken */
.brand-logo-wrap {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

/* Pulserende rød prikk øverst til høyre på logoen */
.update-dot {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 10px;
  height: 10px;
  background: #ef4444;
  border-radius: 50%;
  border: 2px solid #0f172a;
  animation: update-pulse 2s ease-in-out infinite;
  pointer-events: none;
}

@keyframes update-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.3);
    opacity: 0.75;
  }
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
</style>
